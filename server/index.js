import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const app = express()
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const port = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024
const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const OAUTH_REDIRECT_BASE_URL = (process.env.OAUTH_REDIRECT_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '')
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const oauthStates = new Map()

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
      cb(null, name)
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(file.mimetype)
    if (!ok) return cb(new Error('Unsupported file type'))
    cb(null, true)
  },
})

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false }))
app.use('/uploads', express.static(uploadsDir))

app.use((req, res, next) => {
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    const safeBody = JSON.parse(JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)))
    return originalJson(safeBody)
  }
  next()
})

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
  }
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

async function createSessionForUser(user, token) {
  const expiresAt = new Date(Date.now() + ONE_WEEK_MS)
  await prisma.session.upsert({
    where: { sessionToken: token },
    update: { userId: user.id, expiresAt },
    create: { userId: user.id, sessionToken: token, expiresAt },
  })
}

function getOAuthCallbackUrl(provider) {
  return `${OAUTH_REDIRECT_BASE_URL}/api/auth/${provider}/callback`
}

function missingOAuthVariables(provider) {
  const required = {
    google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'],
    apple: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
  }[provider]

  return required.filter((name) => !process.env[name])
}

function createOAuthState(provider) {
  const state = crypto.randomBytes(32).toString('base64url')
  oauthStates.set(state, { provider, expiresAt: Date.now() + OAUTH_STATE_TTL_MS })
  return state
}

function consumeOAuthState(provider, state) {
  const entry = typeof state === 'string' ? oauthStates.get(state) : null
  if (typeof state === 'string') oauthStates.delete(state)
  return Boolean(entry && entry.provider === provider && entry.expiresAt > Date.now())
}

function oauthErrorRedirect(provider, message) {
  const error = encodeURIComponent(message)
  return `${APP_URL}/login#oauth_provider=${encodeURIComponent(provider)}&oauth_error=${error}`
}

function decodeJwtPart(token, part) {
  const value = token?.split('.')[part]
  if (!value) throw new Error('Malformed ID token')
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function base64UrlToBuffer(value) {
  return Buffer.from(value, 'base64url')
}

async function verifyAppleIdToken(idToken) {
  const header = decodeJwtPart(idToken, 0)
  const claims = decodeJwtPart(idToken, 1)
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected Apple ID token signing algorithm')
  if (claims.iss !== 'https://appleid.apple.com' || claims.aud !== process.env.APPLE_CLIENT_ID) {
    throw new Error('Apple ID token has invalid issuer or audience')
  }
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('Apple ID token has expired')

  const jwksResponse = await fetch('https://appleid.apple.com/auth/keys')
  if (!jwksResponse.ok) throw new Error('Unable to retrieve Apple signing keys')
  const { keys } = await jwksResponse.json()
  const key = keys.find((candidate) => candidate.kid === header.kid)
  if (!key) throw new Error('Apple signing key was not found')

  const publicKey = crypto.createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' })
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.')
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, base64UrlToBuffer(encodedSignature))
  if (!valid) throw new Error('Apple ID token signature is invalid')
  return claims
}

function createAppleClientSecret() {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: 'https://appleid.apple.com',
    sub: process.env.APPLE_CLIENT_ID,
  })).toString('base64url')
  const privateKey = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const signingInput = `${header}.${payload}`
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${signingInput}.${signature}`
}

function uniqueUsername(email, preferredName) {
  const source = (preferredName || email.split('@')[0] || 'user').toLowerCase()
  return `${source.replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user'}_${crypto.randomBytes(4).toString('hex')}`
}

async function findOrCreateOAuthUser({ provider, providerAccountId, email, name, avatarUrl, tokens }) {
  const existingAccount = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: { include: { profile: true } } },
  })
  const expiresAt = tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null
  const accountData = {
    type: 'oauth',
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token || null,
    expiresAt,
    tokenType: tokens.token_type || null,
    scope: tokens.scope || null,
    idToken: tokens.id_token || null,
  }

  if (existingAccount) {
    await prisma.account.update({ where: { id: existingAccount.id }, data: accountData })
    return existingAccount.user
  }

  let user = await prisma.user.findUnique({ where: { email }, include: { profile: true } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        username: uniqueUsername(email, name),
        avatarUrl: avatarUrl || null,
        profile: { create: { displayName: name || email.split('@')[0], timezone: 'UTC', locale: 'en-US' } },
      },
      include: { profile: true },
    })
  }

  await prisma.account.create({ data: { userId: user.id, provider, providerAccountId, ...accountData } })
  return user
}

async function finishOAuthLogin(res, provider, identity, tokens) {
  if (!identity.providerAccountId || !identity.email) throw new Error(`${provider} did not return a verified email address`)
  const user = await findOrCreateOAuthUser({ provider, ...identity, tokens })
  const token = signToken(user)
  await createSessionForUser(user, token)
  const hash = new URLSearchParams({ oauth_provider: provider, oauth_token: token }).toString()
  res.redirect(`${APP_URL}/login#${hash}`)
}

async function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { profile: true },
    })

    if (!user) return res.status(401).json({ error: 'User not found' })

    const session = await prisma.session.findUnique({ where: { sessionToken: token } })
    if (!session || session.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Session expired' })
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function validateOwnership(req, userId, label = 'resource') {
  if (String(req.user.id) !== String(userId)) {
    return false
  }
  return true
}

function normalizeSort(sortBy) {
  switch (sortBy) {
    case 'oldest':
      return { createdAt: 'asc' }
    case 'name_az':
      return { title: 'asc' }
    case 'name_za':
      return { title: 'desc' }
    case 'size_asc':
      return { fileSizeBytes: 'asc' }
    case 'size_desc':
      return { fileSizeBytes: 'desc' }
    default:
      return { createdAt: 'desc' }
  }
}

async function removeLocalPhotoFile(photo) {
  if (!photo?.filename || !photo.storageKey?.startsWith('uploads/')) return
  const filename = path.basename(photo.filename)
  const filePath = path.join(uploadsDir, filename)
  if (path.dirname(filePath) !== uploadsDir) return

  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'Photo Manager API',
    version: '1.0.0',
    endpoints: ['/health', '/api/health', '/api/login', '/api/register', '/api/me'],
  })
})

app.get('/health', (_req, res) => res.json({ ok: true, service: 'photo-manager-api' }))
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'photo-manager-api' }))

app.get('/api/auth/:provider', (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase()
  if (!['google', 'microsoft', 'apple'].includes(provider)) {
    return res.status(404).json({ error: 'Unknown OAuth provider' })
  }

  const missing = missingOAuthVariables(provider)
  if (missing.length) {
    return res.redirect(oauthErrorRedirect(
      provider,
      `${provider[0].toUpperCase()}${provider.slice(1)} sign-in has not been configured. Missing: ${missing.join(', ')}`,
    ))
  }

  const state = createOAuthState(provider)
  const callbackUrl = getOAuthCallbackUrl(provider)
  let authorizationUrl

  if (provider === 'google') {
    authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizationUrl.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString()
  } else if (provider === 'microsoft') {
    authorizationUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MICROSOFT_TENANT_ID)}/oauth2/v2.0/authorize`)
    authorizationUrl.search = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      response_mode: 'query',
      scope: 'openid profile email offline_access User.Read',
      state,
      prompt: 'select_account',
    }).toString()
  } else {
    authorizationUrl = new URL('https://appleid.apple.com/auth/authorize')
    authorizationUrl.search = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
    }).toString()
  }

  res.redirect(authorizationUrl.toString())
})

async function handleGoogleCallback(req, res) {
  if (!consumeOAuthState('google', req.query.state)) return res.redirect(oauthErrorRedirect('google', 'Invalid or expired OAuth state'))
  if (req.query.error) return res.redirect(oauthErrorRedirect('google', String(req.query.error)))
  if (!req.query.code) return res.redirect(oauthErrorRedirect('google', 'Google did not return an authorization code'))

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: getOAuthCallbackUrl('google'),
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok) throw new Error('Google token exchange failed')
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const profile = await profileResponse.json()
    if (!profileResponse.ok || !profile.email_verified) throw new Error('Google did not return a verified email address')
    await finishOAuthLogin(res, 'google', { providerAccountId: profile.sub, email: profile.email.toLowerCase(), name: profile.name, avatarUrl: profile.picture }, tokens)
  } catch (error) {
    res.redirect(oauthErrorRedirect('google', error instanceof Error ? error.message : 'Google sign-in failed'))
  }
}

async function handleMicrosoftCallback(req, res) {
  if (!consumeOAuthState('microsoft', req.query.state)) return res.redirect(oauthErrorRedirect('microsoft', 'Invalid or expired OAuth state'))
  if (req.query.error) return res.redirect(oauthErrorRedirect('microsoft', String(req.query.error_description || req.query.error)))
  if (!req.query.code) return res.redirect(oauthErrorRedirect('microsoft', 'Microsoft did not return an authorization code'))

  try {
    const tenant = encodeURIComponent(process.env.MICROSOFT_TENANT_ID)
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: getOAuthCallbackUrl('microsoft'),
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok) throw new Error('Microsoft token exchange failed')
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const profile = await profileResponse.json()
    const email = profile.mail || profile.userPrincipalName
    if (!profileResponse.ok || !email) throw new Error('Microsoft did not return an email address')
    await finishOAuthLogin(res, 'microsoft', { providerAccountId: profile.id, email: email.toLowerCase(), name: profile.displayName }, tokens)
  } catch (error) {
    res.redirect(oauthErrorRedirect('microsoft', error instanceof Error ? error.message : 'Microsoft sign-in failed'))
  }
}

async function handleAppleCallback(req, res) {
  const body = req.body || {}
  if (!consumeOAuthState('apple', body.state)) return res.redirect(oauthErrorRedirect('apple', 'Invalid or expired OAuth state'))
  if (body.error) return res.redirect(oauthErrorRedirect('apple', String(body.error)))
  if (!body.code) return res.redirect(oauthErrorRedirect('apple', 'Apple did not return an authorization code'))

  try {
    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(body.code),
        client_id: process.env.APPLE_CLIENT_ID,
        client_secret: createAppleClientSecret(),
        redirect_uri: getOAuthCallbackUrl('apple'),
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || !tokens.id_token) throw new Error('Apple token exchange failed')
    const claims = await verifyAppleIdToken(tokens.id_token)
    const firstLoginUser = typeof body.user === 'string' ? JSON.parse(body.user) : null
    const name = firstLoginUser ? [firstLoginUser.name?.firstName, firstLoginUser.name?.lastName].filter(Boolean).join(' ') : undefined
    await finishOAuthLogin(res, 'apple', { providerAccountId: claims.sub, email: claims.email?.toLowerCase(), name }, tokens)
  } catch (error) {
    res.redirect(oauthErrorRedirect('apple', error instanceof Error ? error.message : 'Apple sign-in failed'))
  }
}

app.get('/api/auth/google/callback', handleGoogleCallback)
app.get('/api/auth/microsoft/callback', handleMicrosoftCallback)
app.post('/api/auth/apple/callback', handleAppleCallback)

app.post('/api/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const username = String(req.body?.username || '').trim()

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: username || email.split('@')[0] }] },
  })

  if (existing) return res.status(409).json({ error: 'User already exists' })

  const user = await prisma.user.create({
    data: {
      email,
      username: username || email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 10),
      profile: {
        create: {
          displayName: username || email.split('@')[0],
          timezone: 'UTC',
          locale: 'en-US',
        },
      },
    },
    include: { profile: true },
  })

  const token = signToken(user)
  await createSessionForUser(user, token)

  res.status(201).json({
    token,
    user: sanitizeUser(user),
  })
})

app.post('/api/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } })
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const token = signToken(user)
  await createSessionForUser(user, token)

  res.json({
    token,
    user: sanitizeUser(user),
  })
})

app.post('/api/logout', requireAuth, async (req, res) => {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(400).json({ error: 'Missing token' })

  await prisma.session.deleteMany({
    where: {
      userId: req.user.id,
      sessionToken: token,
    },
  })

  res.json({ success: true, message: 'Logged out' })
})

app.post('/api/session/refresh', requireAuth, async (req, res) => {
  const oldToken = getTokenFromRequest(req)
  if (!oldToken) return res.status(400).json({ error: 'Missing token' })

  const session = await prisma.session.findUnique({ where: { sessionToken: oldToken } })
  if (!session || session.expiresAt <= new Date()) {
    return res.status(401).json({ error: 'Session expired' })
  }

  const newToken = signToken(req.user)
  await prisma.session.update({
    where: { sessionToken: oldToken },
    data: { sessionToken: newToken, expiresAt: new Date(Date.now() + ONE_WEEK_MS) },
  })

  res.json({ token: newToken, user: sanitizeUser(req.user) })
})

app.get('/api/me', async (req, res) => {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { profile: true },
    })

    if (!user) return res.status(404).json({ error: 'User not found' })

    const session = await prisma.session.findUnique({ where: { sessionToken: token } })
    if (!session || session.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Session expired' })
    }

    res.json({
      user: sanitizeUser(user),
      profile: user.profile,
    })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
})

app.get('/api/profile', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { profile: true },
  })

  if (!user) return res.status(404).json({ error: 'User not found' })

  res.json({
    user: sanitizeUser(user),
    profile: user.profile,
  })
})

app.patch('/api/profile', requireAuth, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim() : undefined
  const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim() : undefined

  if (!username && !email && !bio && !avatarUrl) {
    return res.status(400).json({ error: 'No profile changes provided' })
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(username ? { username } : {}),
      ...(email ? { email } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
    include: { profile: true },
  })

  if (username || bio || avatarUrl) {
    await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: {
        ...(username ? { displayName: username } : {}),
        ...(bio !== undefined ? { preferences: { ...(updatedUser.profile?.preferences || {}), bio } } : {}),
        ...(avatarUrl !== undefined ? { preferences: { ...(updatedUser.profile?.preferences || {}), avatarUrl } } : {}),
      },
      create: {
        userId: req.user.id,
        displayName: username || updatedUser.username,
      },
    })
  }

  res.json({
    user: sanitizeUser(updatedUser),
    profile: updatedUser.profile,
  })
})

app.post('/api/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: 'User account is invalid' })
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!matches) return res.status(401).json({ error: 'Current password is incorrect' })

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash },
  })

  res.json({ success: true, message: 'Password updated successfully' })
})

app.post('/api/password-reset/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'Email is required' })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return res.status(404).json({ error: 'No account found for that email' })
  }

  return res.status(501).json({
    error: 'Password reset email delivery is not yet implemented for this app.',
    email,
  })
})

app.post('/api/password-reset/confirm', async (_req, res) => {
  return res.status(501).json({ error: 'Password reset confirmation flow is not yet implemented for this app.' })
})

app.post('/api/photos/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No file uploaded' })

    const title = String(req.body?.title || file.originalname || 'upload').trim()
    const folderId = req.body?.folderId ? String(req.body.folderId) : null
    const visibility = String(req.body?.visibility || 'PRIVATE').toUpperCase()

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: req.user.id, isDeleted: false },
      })
      if (!folder) return res.status(404).json({ error: 'Folder not found' })
    }

    const photo = await prisma.photo.create({
      data: {
        userId: req.user.id,
        folderId,
        title,
        filename: file.filename,
        originalName: file.originalname,
        url: `/uploads/${file.filename}`,
        storageKey: `uploads/${file.filename}`,
        mimeType: file.mimetype,
        width: null,
        height: null,
        fileSizeBytes: BigInt(file.size),
        visibility: visibility === 'PUBLIC' ? 'PUBLIC' : visibility === 'SHARED' ? 'SHARED' : 'PRIVATE',
      },
    })

    res.status(201).json({ photo })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to upload photo' })
  }
})

app.get('/api/photos', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const folderId = req.query.folderId ? String(req.query.folderId) : undefined
  const favoriteOnly = String(req.query.favoriteOnly || 'false') === 'true'
  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))
  const sortBy = String(req.query.sortBy || 'newest')

  const where = {
    userId: req.user.id,
    isDeleted: false,
    ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    ...(folderId ? { folderId } : {}),
    ...(favoriteOnly ? { favorites: { some: { userId: req.user.id } } } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      include: {
        folder: true,
        favorites: { where: { userId: req.user.id } },
      },
      orderBy: normalizeSort(sortBy),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.photo.count({ where }),
  ])

  res.json({
    items: items.map((photo) => ({
      ...photo,
      favorite: photo.favorites.length > 0,
      size: `${(Number(photo.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
    })),
    total,
    page,
    limit,
  })
})

app.get('/api/photos/:id', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
    include: { folder: true, favorites: { where: { userId: req.user.id } }, tags: { include: { tag: true } } },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  res.json({
    ...photo,
    favorite: photo.favorites.length > 0,
    size: `${(Number(photo.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
  })
})

app.patch('/api/photos/:id', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined
  const folderId = req.body?.folderId === null ? null : typeof req.body?.folderId === 'string' ? req.body.folderId : undefined
  const visibility = typeof req.body?.visibility === 'string' ? req.body.visibility.toUpperCase() : undefined

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId: req.user.id, isDeleted: false },
    })
    if (!folder) return res.status(404).json({ error: 'Folder not found' })
  }

  const updated = await prisma.photo.update({
    where: { id: photo.id },
    data: {
      ...(title ? { title } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
      ...(visibility ? { visibility: visibility === 'PUBLIC' ? 'PUBLIC' : visibility === 'SHARED' ? 'SHARED' : 'PRIVATE' } : {}),
    },
  })

  res.json({ photo: updated })
})

app.delete('/api/photos/:id', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  await prisma.$transaction(async (tx) => {
    await tx.photo.update({
      where: { id: photo.id },
      data: { isDeleted: true, deletedAt: new Date() },
    })

    await tx.trashItem.create({
      data: {
        userId: req.user.id,
        photoId: photo.id,
        reason: 'deleted',
      },
    })
  })

  res.json({ success: true, message: 'Photo moved to trash' })
})

app.post('/api/photos/:id/favorite', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  const favorite = await prisma.favorite.upsert({
    where: { userId_photoId: { userId: req.user.id, photoId: photo.id } },
    update: {},
    create: { userId: req.user.id, photoId: photo.id },
  })

  res.json({ favorite })
})

app.delete('/api/photos/:id/favorite', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  await prisma.favorite.deleteMany({
    where: { userId: req.user.id, photoId: photo.id },
  })

  res.json({ success: true })
})

app.post('/api/photos/:id/restore', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  const restored = await prisma.photo.update({
    where: { id: photo.id },
    data: { isDeleted: false, deletedAt: null },
  })

  await prisma.trashItem.deleteMany({
    where: { userId: req.user.id, photoId: photo.id },
  })

  res.json({ success: true, photo: restored })
})

app.get('/api/photos/:id/download', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  const filePath = path.join(__dirname, '..', photo.storageKey)
  if (fs.existsSync(filePath)) {
    return res.download(filePath, photo.originalName || photo.filename)
  }

  if (photo.url.startsWith('http')) {
    return res.redirect(photo.url)
  }

  res.status(404).json({ error: 'File not found' })
})

app.get('/api/albums', requireAuth, async (req, res) => {
  const items = await prisma.album.findMany({
    where: { userId: req.user.id, isDeleted: false },
    include: {
      photos: { include: { photo: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ items: items.map((album) => ({
    ...album,
    photoCount: album.photos.length,
    cover: album.coverUrl || album.photos[0]?.photo?.url || null,
  })) })
})

app.get('/api/albums/:id', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
    include: { photos: { include: { photo: true }, orderBy: { order: 'asc' } } },
  })

  if (!album) return res.status(404).json({ error: 'Album not found' })

  res.json({ album: { ...album, photoCount: album.photos.length } })
})

app.post('/api/albums', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Album name is required' })

  const album = await prisma.album.create({
    data: {
      userId: req.user.id,
      name,
      description: req.body?.description || null,
      coverUrl: req.body?.coverUrl || null,
      visibility: String(req.body?.visibility || 'PRIVATE').toUpperCase() === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
    },
  })

  res.status(201).json({ album })
})

app.patch('/api/albums/:id', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!album) return res.status(404).json({ error: 'Album not found' })

  const updated = await prisma.album.update({
    where: { id: album.id },
    data: {
      ...(typeof req.body?.name === 'string' ? { name: req.body.name.trim() } : {}),
      ...(typeof req.body?.description === 'string' ? { description: req.body.description } : {}),
      ...(typeof req.body?.coverUrl === 'string' ? { coverUrl: req.body.coverUrl } : {}),
      ...(typeof req.body?.visibility === 'string' ? { visibility: req.body.visibility.toUpperCase() === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE' } : {}),
    },
  })

  res.json({ album: updated })
})

app.delete('/api/albums/:id', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!album) return res.status(404).json({ error: 'Album not found' })

  await prisma.$transaction(async (tx) => {
    await tx.album.update({
      where: { id: album.id },
      data: { isDeleted: true, deletedAt: new Date() },
    })

    await tx.trashItem.create({
      data: {
        userId: req.user.id,
        albumId: album.id,
        reason: 'deleted',
      },
    })
  })

  res.json({ success: true, message: 'Album moved to trash' })
})

app.post('/api/albums/:id/photos', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!album) return res.status(404).json({ error: 'Album not found' })

  const photoIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds : []
  if (!photoIds.length) return res.status(400).json({ error: 'At least one photoId is required' })

  const existingPhotos = await prisma.photo.findMany({
    where: { id: { in: photoIds }, userId: req.user.id, isDeleted: false },
  })

  if (existingPhotos.length !== photoIds.length) {
    return res.status(400).json({ error: 'One or more photos are invalid or not owned by you' })
  }

  const rows = await Promise.all(photoIds.map((photoId, index) => prisma.albumPhoto.upsert({
    where: { albumId_photoId: { albumId: album.id, photoId } },
    update: { order: index },
    create: { albumId: album.id, photoId, order: index },
  })))

  res.status(201).json({ items: rows })
})

app.delete('/api/albums/:id/photos/:photoId', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!album) return res.status(404).json({ error: 'Album not found' })

  await prisma.albumPhoto.deleteMany({
    where: { albumId: album.id, photoId: req.params.photoId },
  })

  res.json({ success: true })
})

app.get('/api/folders', requireAuth, async (req, res) => {
  const items = await prisma.folder.findMany({
    where: { userId: req.user.id, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    include: { children: true, parent: true },
  })

  res.json({ items })
})

app.get('/api/folders/:id', requireAuth, async (req, res) => {
  const folder = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
    include: { parent: true, children: true },
  })

  if (!folder) return res.status(404).json({ error: 'Folder not found' })

  res.json({ folder })
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Folder name is required' })

  const parentId = req.body?.parentId ? String(req.body.parentId) : null
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, userId: req.user.id, isDeleted: false },
    })
    if (!parent) return res.status(404).json({ error: 'Parent folder not found' })
  }

  const folder = await prisma.folder.create({
    data: {
      userId: req.user.id,
      name,
      parentId,
      color: req.body?.color || '#4f46e5',
      path: parentId ? `/folders/${parentId}/${name}` : `/folders/${name}`,
    },
  })

  res.status(201).json({ folder })
})

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  const folder = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!folder) return res.status(404).json({ error: 'Folder not found' })

  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: {
      ...(typeof req.body?.name === 'string' ? { name: req.body.name.trim() } : {}),
      ...(typeof req.body?.color === 'string' ? { color: req.body.color } : {}),
    },
  })

  res.json({ folder: updated })
})

app.patch('/api/folders/:id/move', requireAuth, async (req, res) => {
  const folder = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.id, isDeleted: false },
  })

  if (!folder) return res.status(404).json({ error: 'Folder not found' })

  const parentId = req.body?.parentId ? String(req.body.parentId) : null
  if (parentId && parentId === folder.id) {
    return res.status(400).json({ error: 'A folder cannot be moved into itself' })
  }

  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, userId: req.user.id, isDeleted: false },
    })
    if (!parent) return res.status(404).json({ error: 'Parent folder not found' })
  }

  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: { parentId },
  })

  res.json({ folder: updated })
})

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const folder = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  })

  if (!folder) return res.status(404).json({ error: 'Folder not found' })

  await prisma.$transaction(async (tx) => {
    await tx.folder.update({
      where: { id: folder.id },
      data: { isDeleted: true, deletedAt: new Date() },
    })

    await tx.trashItem.create({
      data: {
        userId: req.user.id,
        folderId: folder.id,
        reason: 'deleted',
      },
    })
  })

  res.json({ success: true, message: 'Folder moved to trash' })
})

app.get('/api/trash', requireAuth, async (_req, res) => {
  const items = await prisma.trashItem.findMany({
    where: { userId: _req.user.id },
    orderBy: { deletedAt: 'desc' },
    include: {
      photo: true,
      album: true,
      folder: true,
    },
  })

  res.json({ items })
})

app.post('/api/trash/:id/restore', requireAuth, async (req, res) => {
  const item = await prisma.trashItem.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { photo: true, album: true, folder: true },
  })

  if (!item) return res.status(404).json({ error: 'Trash item not found' })

  if (item.photoId) {
    await prisma.photo.update({ where: { id: item.photoId }, data: { isDeleted: false, deletedAt: null } })
  }

  if (item.albumId) {
    await prisma.album.update({ where: { id: item.albumId }, data: { isDeleted: false, deletedAt: null } })
  }

  if (item.folderId) {
    await prisma.folder.update({ where: { id: item.folderId }, data: { isDeleted: false, deletedAt: null } })
  }

  await prisma.trashItem.delete({ where: { id: item.id } })

  res.json({ success: true })
})

app.delete('/api/trash/:id/permanent-delete', requireAuth, async (req, res) => {
  const item = await prisma.trashItem.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { photo: true },
  })

  if (!item) return res.status(404).json({ error: 'Trash item not found' })

  if (item.photoId) {
    await removeLocalPhotoFile(item.photo)
    await prisma.photo.delete({ where: { id: item.photoId } })
  }

  if (item.albumId) {
    await prisma.album.delete({ where: { id: item.albumId } })
  }

  if (item.folderId) {
    await prisma.folder.delete({ where: { id: item.folderId } })
  }

  await prisma.trashItem.delete({ where: { id: item.id } })

  res.json({ success: true })
})

app.delete('/api/trash/empty', requireAuth, async (req, res) => {
  const items = await prisma.trashItem.findMany({ where: { userId: req.user.id }, include: { photo: true } })

  for (const item of items) {
    if (item.photoId) {
      await removeLocalPhotoFile(item.photo)
      await prisma.photo.deleteMany({ where: { id: item.photoId, userId: req.user.id } })
    }
    if (item.albumId) await prisma.album.deleteMany({ where: { id: item.albumId, userId: req.user.id } })
    if (item.folderId) await prisma.folder.deleteMany({ where: { id: item.folderId, userId: req.user.id } })
  }

  await prisma.trashItem.deleteMany({ where: { userId: req.user.id } })

  res.json({ success: true, deleted: items.length })
})

app.post('/api/photos/:id/share', requireAuth, async (req, res) => {
  const photo = await prisma.photo.findFirst({ where: { id: req.params.id, userId: req.user.id, isDeleted: false } })
  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  const permissionLevel = String(req.body?.permissionLevel || 'VIEW').toUpperCase()
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null
  const shareToken = crypto.randomBytes(18).toString('hex')

  const shared = await prisma.sharedPhoto.create({
    data: {
      userId: req.user.id,
      photoId: photo.id,
      shareToken,
      permissionLevel: permissionLevel === 'EDIT' ? 'EDIT' : permissionLevel === 'MANAGE' ? 'MANAGE' : 'VIEW',
      expiresAt,
      isActive: true,
    },
  })

  res.status(201).json({ share: shared })
})

app.post('/api/albums/:id/share', requireAuth, async (req, res) => {
  const album = await prisma.album.findFirst({ where: { id: req.params.id, userId: req.user.id, isDeleted: false } })
  if (!album) return res.status(404).json({ error: 'Album not found' })

  const permissionLevel = String(req.body?.permissionLevel || 'VIEW').toUpperCase()
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null
  const shareToken = crypto.randomBytes(18).toString('hex')

  const shared = await prisma.sharedAlbum.create({
    data: {
      userId: req.user.id,
      albumId: album.id,
      shareToken,
      permissionLevel: permissionLevel === 'EDIT' ? 'EDIT' : permissionLevel === 'MANAGE' ? 'MANAGE' : 'VIEW',
      expiresAt,
      isActive: true,
    },
  })

  res.status(201).json({ share: shared })
})

app.get('/api/share/:token', async (req, res) => {
  const token = req.params.token
  const photoShare = await prisma.sharedPhoto.findUnique({ where: { shareToken: token }, include: { photo: true } })
  if (photoShare && photoShare.isActive && (!photoShare.expiresAt || photoShare.expiresAt > new Date())) {
    return res.json({ type: 'photo', item: photoShare.photo })
  }

  const albumShare = await prisma.sharedAlbum.findUnique({ where: { shareToken: token }, include: { album: true } })
  if (albumShare && albumShare.isActive && (!albumShare.expiresAt || albumShare.expiresAt > new Date())) {
    return res.json({ type: 'album', item: albumShare.album })
  }

  return res.status(404).json({ error: 'Shared item not found or expired' })
})

app.delete('/api/share/:token', requireAuth, async (req, res) => {
  const token = req.params.token
  const photo = await prisma.sharedPhoto.findFirst({ where: { shareToken: token, userId: req.user.id } })
  if (photo) {
    await prisma.sharedPhoto.update({ where: { id: photo.id }, data: { isActive: false } })
    return res.json({ success: true })
  }

  const album = await prisma.sharedAlbum.findFirst({ where: { shareToken: token, userId: req.user.id } })
  if (album) {
    await prisma.sharedAlbum.update({ where: { id: album.id }, data: { isActive: false } })
    return res.json({ success: true })
  }

  res.status(404).json({ error: 'Share not found' })
})

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const [photoCount, albumCount, folderCount, totalStorage, recentPhotos] = await Promise.all([
    prisma.photo.count({ where: { userId: req.user.id, isDeleted: false } }),
    prisma.album.count({ where: { userId: req.user.id, isDeleted: false } }),
    prisma.folder.count({ where: { userId: req.user.id, isDeleted: false } }),
    prisma.storageMetadata.aggregate({
      where: { userId: req.user.id },
      _sum: { fileSizeBytes: true },
    }),
    prisma.photo.findMany({
      where: { userId: req.user.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  res.json({
    photoCount,
    albumCount,
    folderCount,
    storageUsedBytes: Number(totalStorage._sum.fileSizeBytes || 0),
    storageLimitBytes: 10737418240,
    recentPhotos,
  })
})

app.get('/api/storage', requireAuth, async (req, res) => {
  const storage = await prisma.storageMetadata.aggregate({
    where: { userId: req.user.id },
    _sum: { fileSizeBytes: true },
  })

  res.json({
    usedBytes: Number(storage._sum.fileSizeBytes || 0),
    limitBytes: 10737418240,
  })
})

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message })
  }

  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed' })
  }
})

app.listen(port, () => {
  console.log(`Photo Manager API listening on http://localhost:${port}`)
})
