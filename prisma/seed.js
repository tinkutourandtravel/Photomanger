import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const DEMO_PASSWORD = 'pass1234'

async function main() {
  await prisma.$transaction(async (tx) => {
    const demoEmail = 'john.doe@gmail.com'
    const staleUser = await tx.user.findFirst({
      where: {
        OR: [
          { email: 'john.doe@example.com' },
          { username: 'john.doe' },
        ],
      },
    })

    if (staleUser) {
      await tx.user.delete({ where: { id: staleUser.id } })
    }

    const user = await tx.user.upsert({
      where: { email: demoEmail },
      update: {
        username: 'John Doe',
        passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        bio: 'Photographer and memory collector',
        role: 'USER',
        isActive: true,
      },
      create: {
        email: demoEmail,
        username: 'John Doe',
        passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        bio: 'Photographer and memory collector',
        role: 'USER',
        isActive: true,
        profile: {
          create: {
            displayName: 'John Doe',
            timezone: 'UTC',
            locale: 'en-US',
          },
        },
      },
    })

    const rootFolder = await tx.folder.upsert({
      where: { id: 'folder-root-1' },
      update: {},
      create: {
        id: 'folder-root-1',
        userId: user.id,
        name: 'All Photos',
        color: '#4f46e5',
        path: '/All Photos',
      },
    })

    const tripFolder = await tx.folder.upsert({
      where: { id: 'folder-trip-1' },
      update: {},
      create: {
        id: 'folder-trip-1',
        userId: user.id,
        parentId: rootFolder.id,
        name: 'Trips',
        color: '#3b82f6',
        path: '/All Photos/Trips',
      },
    })

    const tags = await Promise.all([
      tx.tag.upsert({ where: { userId_slug: { userId: user.id, slug: 'travel' } }, update: {}, create: { userId: user.id, name: 'travel', slug: 'travel' } }),
      tx.tag.upsert({ where: { userId_slug: { userId: user.id, slug: 'nature' } }, update: {}, create: { userId: user.id, name: 'nature', slug: 'nature' } }),
      tx.tag.upsert({ where: { userId_slug: { userId: user.id, slug: 'family' } }, update: {}, create: { userId: user.id, name: 'family', slug: 'family' } }),
    ])

    const imageOne = await tx.photo.upsert({
      where: { id: 'photo-seed-1' },
      update: {},
      create: {
        id: 'photo-seed-1',
        userId: user.id,
        folderId: tripFolder.id,
        title: 'Mountain Lake',
        filename: 'mountain-lake.jpg',
        originalName: 'mountain-lake.jpg',
        url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
        storageKey: 'photos/mountain-lake.jpg',
        mimeType: 'image/jpeg',
        width: 2400,
        height: 1800,
        fileSizeBytes: 2500000,
        visibility: 'PRIVATE',
        description: 'Lake reflections during sunrise',
        takenAt: new Date('2026-08-14T07:00:00.000Z'),
        tags: {
          create: [{ tagId: tags[0].id, userId: user.id }],
        },
      },
    })

    const imageTwo = await tx.photo.upsert({
      where: { id: 'photo-seed-2' },
      update: {},
      create: {
        id: 'photo-seed-2',
        userId: user.id,
        folderId: rootFolder.id,
        title: 'Forest Trail',
        filename: 'forest-trail.jpg',
        originalName: 'forest-trail.jpg',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        storageKey: 'photos/forest-trail.jpg',
        mimeType: 'image/jpeg',
        width: 2200,
        height: 1600,
        fileSizeBytes: 1800000,
        visibility: 'SHARED',
        description: 'Rain forest morning walk',
        takenAt: new Date('2026-08-18T09:30:00.000Z'),
        tags: {
          create: [{ tagId: tags[1].id, userId: user.id }],
        },
      },
    })

    const album = await tx.album.upsert({
      where: { id: 'album-seed-1' },
      update: {},
      create: {
        id: 'album-seed-1',
        userId: user.id,
        name: 'Weekend Escape',
        description: 'A curated memory album from the last trip.',
        coverUrl: imageOne.url,
        visibility: 'SHARED',
        photos: {
          create: [{ photoId: imageOne.id, order: 1 }, { photoId: imageTwo.id, order: 2 }],
        },
      },
    })

    await tx.favorite.upsert({
      where: { userId_photoId: { userId: user.id, photoId: imageOne.id } },
      update: {},
      create: { userId: user.id, photoId: imageOne.id },
    })

    const sharedPhoto = await tx.sharedPhoto.upsert({
      where: { shareToken: 'share-photo-demo-1' },
      update: {},
      create: {
        userId: user.id,
        photoId: imageTwo.id,
        shareToken: 'share-photo-demo-1',
        permissionLevel: 'VIEW',
      },
    })

    const sharedAlbum = await tx.sharedAlbum.upsert({
      where: { shareToken: 'share-album-demo-1' },
      update: {},
      create: {
        userId: user.id,
        albumId: album.id,
        shareToken: 'share-album-demo-1',
        permissionLevel: 'VIEW',
      },
    })

    await tx.sharePermission.upsert({
      where: { id: 'share-permission-1' },
      update: {},
      create: {
        id: 'share-permission-1',
        userId: user.id,
        sharedPhotoId: sharedPhoto.id,
        permissionLevel: 'VIEW',
      },
    })

    await tx.sharePermission.upsert({
      where: { id: 'share-permission-2' },
      update: {},
      create: {
        id: 'share-permission-2',
        userId: user.id,
        sharedAlbumId: sharedAlbum.id,
        permissionLevel: 'EDIT',
      },
    })

    await tx.notification.createMany({
      data: [
        {
          userId: user.id,
          type: 'SYSTEM',
          title: 'Library synced',
          message: 'Your photo library is up to date.',
        },
        {
          userId: user.id,
          type: 'SHARE',
          title: 'Photo shared',
          message: 'Forest Trail was shared successfully.',
        },
      ],
    })

    await tx.storageMetadata.upsert({
      where: { id: 'storage-seed-1' },
      update: {},
      create: {
        id: 'storage-seed-1',
        userId: user.id,
        photoId: imageOne.id,
        provider: 'S3',
        bucket: 'photo-manager-prod',
        objectKey: 'photos/mountain-lake.jpg',
        fileSizeBytes: 2500000,
        totalUsedBytes: 4300000,
        quotaLimitBytes: 1000000000,
      },
    })

    await tx.session.upsert({
      where: { sessionToken: 'session-demo-token-1' },
      update: {},
      create: {
        userId: user.id,
        sessionToken: 'session-demo-token-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    })

    await tx.account.upsert({
      where: { provider_providerAccountId: { provider: 'credentials', providerAccountId: 'john.doe@gmail.com' } },
      update: {},
      create: {
        userId: user.id,
        type: 'credentials',
        provider: 'credentials',
        providerAccountId: 'john.doe@gmail.com',
      },
    })
  })

  console.log('Seed completed successfully.')
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
