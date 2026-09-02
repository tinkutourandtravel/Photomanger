import { useEffect, useMemo, useState } from 'react'
import {
  AnimatePresence,
  motion,
} from 'framer-motion'
import {
  Album,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  Palette,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  SunMedium,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import './App.css'
import { albums, folders, notifications, photos, sharedPhotos } from './data/mockData'

const sidebarItems = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/app/dashboard' },
  { label: 'All Photos', icon: ImageIcon, path: '/app/photos' },
  { label: 'Albums', icon: Album, path: '/app/albums' },
  { label: 'Folders', icon: Folder, path: '/app/folders' },
  { label: 'Favorites', icon: Star, path: '/app/favorites' },
  { label: 'Shared', icon: Users, path: '/app/shared' },
  { label: 'Trash', icon: Trash2, path: '/app/trash' },
]

const navProfileMenu = [
  { label: 'Profile', icon: User },
  { label: 'Account Settings', icon: Settings },
  { label: 'Storage', icon: CloudUpload },
  { label: 'Preferences', icon: Palette },
  { label: 'Logout', icon: LogOut },
]

const sortOptions = ['Newest', 'Oldest', 'Name A-Z', 'Name Z-A', 'File size']
const filterOptions = ['Date', 'Folder', 'Album', 'Favorites', 'File type']
const colorPalette = ['#4f46e5', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#64748b']
const API_BASE = import.meta.env.DEV ? 'http://localhost:4000' : ''
type TrashPhotoItem = { id: string; photo: (typeof photos)[number]; deletedAt: string }

function getAuthHeaders(includeContentType = false) {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (includeContentType) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function toApiUrl(path: string) {
  return `${API_BASE}${path}`
}

function normalizePhotoFromApi(photo: any) {
  const sizeBytes = Number(photo.fileSizeBytes || 0)
  return {
    id: photo.id,
    name: photo.title || photo.originalName || 'Untitled photo',
    url: photo.url?.startsWith('http') ? photo.url : toApiUrl(photo.url || ''),
    size: typeof photo.size === 'string' ? photo.size : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
    date: photo.createdAt ? new Date(photo.createdAt).toISOString().slice(0, 10) : 'Unknown date',
    resolution: photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—',
    folder: photo.folder?.name || 'All Photos',
    albums: Array.isArray(photo.albums) ? photo.albums : [],
    favorite: Boolean(photo.favorite || (photo.favorites && photo.favorites.length > 0)),
    shared: Boolean(photo.shared || photo.visibility === 'SHARED'),
    tags: Array.isArray(photo.tags) ? photo.tags.map((tag: any) => tag.tag?.name || tag.name || '').filter(Boolean) : [],
  }
}

function normalizeAlbumFromApi(album: any) {
  return {
    id: album.id,
    name: album.name,
    cover: album.coverUrl || album.cover || 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80',
    photoCount: Number(album.photoCount || album.photos?.length || 0),
    createdAt: album.createdAt ? new Date(album.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now',
    description: album.description || 'Album',
  }
}

function normalizeFolderFromApi(folder: any) {
  return {
    id: folder.id,
    name: folder.name,
    count: Number(folder.count || folder.photoCount || 0),
    color: folder.color || '#4f46e5',
    parent: folder.parent?.name || folder.parentName || 'All Photos',
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 Bytes'
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [selectedView, setSelectedView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('Newest')
  const [activeFilter, setActiveFilter] = useState('Date')
  const [showPermissionModal, setShowPermissionModal] = useState(true)
  const [showAlbumModal, setShowAlbumModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showViewer, setShowViewer] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [photoState, setPhotoState] = useState<typeof photos>([])
  const [albumState, setAlbumState] = useState<typeof albums>([])
  const [folderState, setFolderState] = useState<typeof folders>([])
  const [trashItems, setTrashItems] = useState<TrashPhotoItem[]>([])
  const [dashboard, setDashboard] = useState({ photoCount: 0, albumCount: 0, folderCount: 0, storageUsedBytes: 0, storageLimitBytes: 10737418240 })
  const [notificationItems] = useState(notifications)
  const [favoriteIds, setFavoriteIds] = useState(new Set<string>())
  const [uploadName, setUploadName] = useState('trip-lake.jpg')
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [albumColor, setAlbumColor] = useState('#4f46e5')
  const [folderColor, setFolderColor] = useState('#3b82f6')
  const [isLoading, setIsLoading] = useState(true)
  const [toasts, setToasts] = useState<Array<{ id: number; title: string; detail: string; tone: 'success' | 'info' | 'warning' }>>([
    { id: 1, title: 'Library synced', detail: 'All mock media is ready to review.', tone: 'success' },
  ])

  const filteredPhotos = useMemo(() => {
    let list = [...photoState]
    const q = search.trim().toLowerCase()

    if (q) {
      list = list.filter((photo) => [photo.name, photo.folder, photo.tags.join(' ')].join(' ').toLowerCase().includes(q))
    }

    if (activeFilter === 'Favorites') {
      list = list.filter((photo) => favoriteIds.has(photo.id))
    }

    if (activeFilter === 'Folder') {
      list = list.filter((photo) => photo.folder.toLowerCase() === 'trips' || photo.folder.toLowerCase() === 'nature')
    }

    if (activeFilter === 'Album') {
      list = list.filter((photo) => photo.albums.length > 0)
    }

    switch (sortBy) {
      case 'Oldest':
        list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        break
      case 'Name A-Z':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'Name Z-A':
        list.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'File size':
        list.sort((a, b) => Number.parseFloat(b.size) - Number.parseFloat(a.size))
        break
      default:
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }

    return list
  }, [photoState, search, activeFilter, favoriteIds, sortBy])

  const addToast = (title: string, detail: string, tone: 'success' | 'info' | 'warning' = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev.slice(-2), { id, title, detail, tone }])
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  useEffect(() => {
    document.body.classList.toggle('dark-theme', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 450)
    return () => window.clearTimeout(timer)
  }, [])

  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!user) {
      setPhotoState([])
      setAlbumState([])
      setFolderState([])
      setTrashItems([])
      setFavoriteIds(new Set())
      setDashboard({ photoCount: 0, albumCount: 0, folderCount: 0, storageUsedBytes: 0, storageLimitBytes: 10737418240 })
      return
    }

    const loadLibrary = async () => {
      try {
        const [photoData, albumData, folderData, dashboardData, trashData] = await Promise.all([
          fetch(toApiUrl('/api/photos?limit=50'), { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load photos'))),
          fetch(toApiUrl('/api/albums'), { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load albums'))),
          fetch(toApiUrl('/api/folders'), { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load folders'))),
          fetch(toApiUrl('/api/dashboard'), { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load dashboard'))),
          fetch(toApiUrl('/api/trash'), { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load trash'))),
        ])

        const loadedPhotos = (photoData.items || []).map(normalizePhotoFromApi)
        setPhotoState(loadedPhotos)
        setFavoriteIds(new Set(loadedPhotos.filter((photo: (typeof photos)[number]) => photo.favorite).map((photo: (typeof photos)[number]) => photo.id)))
        setAlbumState((albumData.items || []).map(normalizeAlbumFromApi))
        setFolderState((folderData.items || []).map(normalizeFolderFromApi))
        setDashboard(dashboardData)
        setTrashItems((trashData.items || []).filter((item: any) => item.photo).map((item: any) => ({ id: item.id, photo: normalizePhotoFromApi(item.photo), deletedAt: item.deletedAt })))
      } catch (error) {
        addToast('Library refresh failed', error instanceof Error ? error.message : 'Unable to sync with the server.', 'warning')
      }
    }

    loadLibrary()
  }, [user])

  const currentPhoto = filteredPhotos[activePhotoIndex] ?? filteredPhotos[0] ?? photoState[0]

  const toggleFavorite = async (id: string) => {
    const nextValue = !favoriteIds.has(id)
    const token = localStorage.getItem('token')

    try {
      if (token) {
        const res = await fetch(toApiUrl(`/api/photos/${id}/favorite`), {
          method: nextValue ? 'POST' : 'DELETE',
          headers: getAuthHeaders(),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || 'Unable to update favorite')
        }
      }

      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (nextValue) next.add(id)
        else next.delete(id)
        return next
      })
      setPhotoState((prev) =>
        prev.map((photo) =>
          photo.id === id
            ? { ...photo, favorite: nextValue }
            : photo,
        ),
      )
      addToast('Favorites updated', 'Photo collection updated.', 'success')
    } catch (error) {
      addToast('Favorite update failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const openViewer = (photoId: string) => {
    const index = filteredPhotos.findIndex((photo) => photo.id === photoId)
    if (index >= 0) {
      setActivePhotoIndex(index)
      setShowViewer(true)
    }
  }

  const closeViewer = () => setShowViewer(false)

  const handleViewerStep = (direction: 'prev' | 'next') => {
    setActivePhotoIndex((prev) => {
      if (direction === 'prev') {
        return prev <= 0 ? filteredPhotos.length - 1 : prev - 1
      }
      return prev >= filteredPhotos.length - 1 ? 0 : prev + 1
    })
  }

  const handleCreateFolder = async () => {
    const trimmed = folderName.trim()
    if (!trimmed) {
      addToast('Folder required', 'Please enter a folder name before creating it.', 'warning')
      return
    }

    try {
      const res = await fetch(toApiUrl('/api/folders'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(true),
        },
        body: JSON.stringify({ name: trimmed, color: folderColor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to create folder')

      setFolderState((prev) => [normalizeFolderFromApi(data.folder), ...prev])
      setFolderName('')
      setShowFolderModal(false)
      addToast('Folder created', `${trimmed} was added to your library.`, 'success')
    } catch (error) {
      addToast('Folder creation failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const handleCreateAlbum = async () => {
    const trimmed = albumName.trim()
    if (!trimmed) {
      addToast('Album required', 'Please enter an album name before creating it.', 'warning')
      return
    }

    try {
      const res = await fetch(toApiUrl('/api/albums'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(true),
        },
        body: JSON.stringify({ name: trimmed, coverUrl: photoState[0]?.url || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to create album')

      setAlbumState((prev) => [normalizeAlbumFromApi(data.album), ...prev])
      setAlbumName('')
      setShowAlbumModal(false)
      addToast('Album created', `${trimmed} is ready to organize photos.`, 'success')
    } catch (error) {
      addToast('Album creation failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const handleUpload = async () => {
    if (!selectedUploadFile) {
      addToast('Select a photo', 'Choose an image from your device before uploading.', 'warning')
      return
    }

    const name = uploadName.trim() || selectedUploadFile.name

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('file', selectedUploadFile)
      formData.append('title', name)

      const res = await fetch(toApiUrl('/api/photos/upload'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to upload photo')

      setPhotoState((prev) => [normalizePhotoFromApi(data.photo), ...prev])
      setDashboard((prev) => ({ ...prev, photoCount: prev.photoCount + 1, storageUsedBytes: prev.storageUsedBytes + Number(data.photo.fileSizeBytes || 0) }))
      setUploadName('')
      setSelectedUploadFile(null)
      setShowUploadModal(false)
      addToast('Upload complete', `${name} was added to your photo library.`, 'success')
    } catch (error) {
      addToast('Upload failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    } finally {
      setIsUploading(false)
    }
  }

  const selectUploadFile = (file: File | undefined) => {
    if (!file) return
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    if (!supportedTypes.includes(file.type)) {
      addToast('Unsupported file', 'Please select a JPG, PNG, WEBP, GIF, HEIC, or HEIF image.', 'warning')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      addToast('File too large', 'Please select an image smaller than 20 MB.', 'warning')
      return
    }
    setSelectedUploadFile(file)
    setUploadName(file.name)
  }

  const refreshDashboard = async () => {
    const response = await fetch(toApiUrl('/api/dashboard'), { headers: getAuthHeaders() })
    if (!response.ok) throw new Error('Unable to refresh dashboard')
    setDashboard(await response.json())
  }

  const handleDeletePhoto = async (id: string) => {
    const photo = photoState.find((item) => item.id === id)
    if (!photo || !window.confirm(`Move “${photo.name}” to Trash?`)) return

    try {
      const response = await fetch(toApiUrl(`/api/photos/${id}`), { method: 'DELETE', headers: getAuthHeaders() })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to move photo to trash')
      setPhotoState((items) => items.filter((item) => item.id !== id))
      setFavoriteIds((items) => { const next = new Set(items); next.delete(id); return next })
      setShowViewer(false)
      const trashResponse = await fetch(toApiUrl('/api/trash'), { headers: getAuthHeaders() })
      if (trashResponse.ok) {
        const trashData = await trashResponse.json()
        setTrashItems((trashData.items || []).filter((item: any) => item.photo).map((item: any) => ({ id: item.id, photo: normalizePhotoFromApi(item.photo), deletedAt: item.deletedAt })))
      }
      await refreshDashboard()
      addToast('Moved to Trash', `${photo.name} can be restored from Trash.`, 'success')
    } catch (error) {
      addToast('Delete failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const handleRestoreTrash = async (trashId: string) => {
    try {
      const response = await fetch(toApiUrl(`/api/trash/${trashId}/restore`), { method: 'POST', headers: getAuthHeaders() })
      if (!response.ok) throw new Error('Unable to restore photo')
      const item = trashItems.find((entry) => entry.id === trashId)
      if (item) setPhotoState((items) => [item.photo, ...items])
      setTrashItems((items) => items.filter((item) => item.id !== trashId))
      await refreshDashboard()
      addToast('Photo restored', 'The photo is back in your library.', 'success')
    } catch (error) {
      addToast('Restore failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const handlePermanentDeleteTrash = async (trashId: string) => {
    if (!window.confirm('Delete this photo permanently? This cannot be undone.')) return
    try {
      const response = await fetch(toApiUrl(`/api/trash/${trashId}/permanent-delete`), { method: 'DELETE', headers: getAuthHeaders() })
      if (!response.ok) throw new Error('Unable to permanently delete photo')
      setTrashItems((items) => items.filter((item) => item.id !== trashId))
      addToast('Photo permanently deleted', 'It has been removed from your account.', 'success')
    } catch (error) {
      addToast('Permanent delete failed', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  const handleEmptyTrash = async () => {
    if (!trashItems.length || !window.confirm('Permanently delete every photo in Trash? This cannot be undone.')) return
    try {
      const response = await fetch(toApiUrl('/api/trash/empty'), { method: 'DELETE', headers: getAuthHeaders() })
      if (!response.ok) throw new Error('Unable to empty trash')
      setTrashItems([])
      addToast('Trash emptied', 'All trashed photos were permanently deleted.', 'success')
    } catch (error) {
      addToast('Unable to empty trash', error instanceof Error ? error.message : 'Please try again.', 'warning')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!showViewer) return
      if (event.key === 'ArrowRight') handleViewerStep('next')
      if (event.key === 'ArrowLeft') handleViewerStep('prev')
      if (event.key === 'Escape') closeViewer()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showViewer, filteredPhotos])

  const showNewUpload = () => {
    setSelectedUploadFile(null)
    setUploadName('')
    setShowUploadModal(true)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />
        <Route path="/register" element={<LandingPage mode="register" />} />
        <Route path="/forgot-password" element={<LandingPage mode="forgot" />} />
        <Route path="/reset-password" element={<LandingPage mode="reset" />} />
        <Route path="/verify-email" element={<LandingPage mode="verify" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/app/*" element={
          authLoading ? <div style={{padding:20}}>Checking authentication...</div> : (
            user ? <AppShell theme={theme} setTheme={setTheme} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} profileOpen={profileOpen} setProfileOpen={setProfileOpen} notificationsOpen={notificationsOpen} setNotificationsOpen={setNotificationsOpen} search={search} setSearch={setSearch} selectedView={selectedView} setSelectedView={setSelectedView} sortBy={sortBy} setSortBy={setSortBy} activeFilter={activeFilter} setActiveFilter={setActiveFilter} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onDeletePhoto={handleDeletePhoto} openViewer={openViewer} filteredPhotos={filteredPhotos} notificationItems={notificationItems} toasts={toasts} removeToast={removeToast} setShowAlbumModal={setShowAlbumModal} setShowFolderModal={setShowFolderModal} onUploadPhotos={showNewUpload} albumState={albumState} folderState={folderState} photoState={photoState} trashItems={trashItems} onRestoreTrash={handleRestoreTrash} onPermanentDeleteTrash={handlePermanentDeleteTrash} onEmptyTrash={handleEmptyTrash} dashboard={dashboard} /> : <Navigate to="/login" replace />
          )
        } />
      </Routes>

      <AnimatePresence>
        {showPermissionModal ? (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="permission-modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
              <div className="permission-header">
                <div className="permission-badge"><ShieldCheck size={18} /></div>
                <button className="icon-button subtle" onClick={() => setShowPermissionModal(false)} aria-label="Close permission request">
                  <X size={14} />
                </button>
              </div>

              <div className="permission-title">Permission Request</div>
              <p className="permission-copy">Photo Manager wants to access your photos and manage them across your account.</p>

              <div className="permission-list">
                <div className="permission-item"><span className="mini-icon"><Eye size={14} /></span> View basic profile information</div>
                <div className="permission-item"><span className="mini-icon"><ImageIcon size={14} /></span> View/manage photos</div>
                <div className="permission-item"><span className="mini-icon"><FolderOpen size={14} /></span> Create/edit/delete albums</div>
                <div className="permission-item"><span className="mini-icon"><Mail size={14} /></span> View email address</div>
              </div>

              <div className="permission-actions">
                <button className="secondary-button" onClick={() => setShowPermissionModal(false)}>Cancel</button>
                <button className="primary-button" onClick={() => setShowPermissionModal(false)}>Accept All</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAlbumModal ? (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="folder-modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
              <div className="modal-top-row">
                <div className="modal-title-group">
                  <div className="permission-badge small"><Album size={16} /></div>
                  <span>Create New Album</span>
                </div>
                <button className="icon-button subtle" onClick={() => setShowAlbumModal(false)} aria-label="Close create album modal"><X size={14} /></button>
              </div>

              <label className="field-label">Album Name</label>
              <input className="modal-input" value={albumName} onChange={(e) => setAlbumName(e.target.value)} placeholder="Enter album name" />

              <label className="field-label">Album Cover</label>
              <div className="select-box">Featured photo <ChevronDown size={16} /></div>

              <label className="field-label">Cover Color</label>
              <div className="palette-row">
                {colorPalette.map((color) => (
                  <button key={color} type="button" className={`color-swatch ${albumColor === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setAlbumColor(color)} />
                ))}
              </div>

              <div className="permission-actions spaced-top">
                <button className="secondary-button" onClick={() => setShowAlbumModal(false)}>Cancel</button>
                <button className="primary-button" onClick={handleCreateAlbum}>Create Album</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showFolderModal ? (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="folder-modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
              <div className="modal-top-row">
                <div className="modal-title-group">
                  <div className="permission-badge small"><FolderPlus size={16} /></div>
                  <span>Create New Folder</span>
                </div>
                <button className="icon-button subtle" onClick={() => setShowFolderModal(false)} aria-label="Close create folder modal"><X size={14} /></button>
              </div>

              <label className="field-label">Folder Name</label>
              <input className="modal-input" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Enter folder name" />

              <label className="field-label">Parent Folder</label>
              <div className="select-box">My Photos <ChevronDown size={16} /></div>

              <label className="field-label">Folder Color</label>
              <div className="palette-row">
                {colorPalette.map((color) => (
                  <button key={color} type="button" className={`color-swatch ${folderColor === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setFolderColor(color)} />
                ))}
              </div>

              <div className="permission-actions spaced-top">
                <button className="secondary-button" onClick={() => setShowFolderModal(false)}>Cancel</button>
                <button className="primary-button" onClick={handleCreateFolder}>Create Folder</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showUploadModal ? (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="upload-modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
              <div className="modal-top-row">
                <div className="modal-title-group">
                  <div className="permission-badge small"><Upload size={16} /></div>
                  <span>Upload Photos</span>
                </div>
                <button className="icon-button subtle" onClick={() => setShowUploadModal(false)} aria-label="Close upload modal"><X size={14} /></button>
              </div>

              <label className="field-label">File name</label>
              <input className="modal-input" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="trip-lake.jpg" />

              <label className="upload-dropzone" htmlFor="upload-file-picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectUploadFile(event.dataTransfer.files[0]) }}>
                <input id="upload-file-picker" className="upload-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" onChange={(event) => selectUploadFile(event.target.files?.[0])} />
                <Upload size={24} />
                <span>{selectedUploadFile ? 'Choose another photo' : 'Drag & drop a photo here, or click to browse'}</span>
                <small>JPG, PNG, WEBP, GIF, HEIC, HEIF · up to 20 MB</small>
              </label>

              <div className="upload-list">
                <div className="upload-row">
                  <span>{selectedUploadFile?.name || 'No photo selected'}</span>
                  <span>{selectedUploadFile ? formatBytes(selectedUploadFile.size) : '—'}</span>
                  <span className={`upload-pill ${selectedUploadFile ? 'success' : ''}`}>{selectedUploadFile ? 'Ready' : 'Select file'}</span>
                </div>
              </div>

              <div className="permission-actions spaced-top">
                <button className="secondary-button" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button className="primary-button" onClick={handleUpload} disabled={!selectedUploadFile || isUploading}>{isUploading ? 'Uploading...' : 'Upload Photo'}</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showViewer ? (
          <motion.div className="viewer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="viewer-shell" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}>
              <div className="viewer-toolbar">
                <button className="icon-button dark" onClick={closeViewer} aria-label="Close viewer"><X size={18} /></button>
                <div className="viewer-actions">
                  <button className="icon-button dark"><Share2 size={16} /></button>
                  <button className="icon-button dark" onClick={() => toggleFavorite(currentPhoto?.id ?? '')}><Heart size={16} fill={currentPhoto && favoriteIds.has(currentPhoto.id) ? 'currentColor' : 'none'} /></button>
                  <button className="icon-button dark"><Download size={16} /></button>
                </div>
              </div>

              <div className="viewer-main">
                <button className="nav-button" onClick={() => handleViewerStep('prev')} aria-label="Previous photo"><ChevronLeft size={18} /></button>
                <img src={currentPhoto?.url ?? photos[0].url} alt={currentPhoto?.name ?? 'Photo'} className="viewer-image" />
                <button className="nav-button" onClick={() => handleViewerStep('next')} aria-label="Next photo"><ChevronRight size={18} /></button>
              </div>

              <div className="viewer-footer">
                <div>
                  <strong>{currentPhoto?.name}</strong>
                  <span>{currentPhoto?.date} • {currentPhoto?.size} • {currentPhoto?.resolution}</span>
                </div>
                <div className="thumbnail-strip">
                  {filteredPhotos.slice(0, 6).map((photo, index) => (
                    <button key={photo.id} className={`thumbnail ${index === activePhotoIndex ? 'active' : ''}`} onClick={() => setActivePhotoIndex(index)}>
                      <img src={photo.url} alt={photo.name} />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isLoading ? (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      ) : null}
    </BrowserRouter>
  )
}

function LandingPage({ mode = 'login' }: { mode?: 'login' | 'register' | 'forgot' | 'reset' | 'verify' }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [email, setEmail] = useState('john.doe@gmail.com')
  const [password, setPassword] = useState('pass1234')
  const [username, setUsername] = useState('John Doe')
  const [oauthError, setOauthError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('oauth_token')
    const error = params.get('oauth_error')
    if (error) {
      setOauthError(error)
      window.history.replaceState({}, '', '/login')
      return
    }
    if (!token) return

    const completeOAuthLogin = async () => {
      try {
        const response = await fetch(toApiUrl('/api/me'), { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json()
        if (!response.ok || !data.user) throw new Error('Unable to complete sign-in')
        auth.login(token, data.user)
        window.history.replaceState({}, '', '/login')
        navigate('/app/dashboard', { replace: true })
      } catch (err) {
        setOauthError(err instanceof Error ? err.message : 'OAuth sign-in failed')
        window.history.replaceState({}, '', '/login')
      }
    }

    completeOAuthLogin()
  }, [auth, navigate])

  const beginOAuthLogin = (provider: 'google' | 'microsoft' | 'apple') => {
    window.location.assign(toApiUrl(`/api/auth/${provider}`))
  }

  const titleMap = {
    login: 'Welcome Back',
    register: 'Create Account',
    forgot: 'Forgot Password',
    reset: 'Reset Password',
    verify: 'Verify Your Email',
  }

  const subtitleMap = {
    login: 'Sign in to continue to your account',
    register: 'Set up your photo library in seconds',
    forgot: 'Enter your email to receive a reset link',
    reset: 'Choose a new password and continue',
    verify: 'We sent a secure code to your inbox',
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel left-panel">
        <div className="brand-mark">
          <div className="brand-icon">P</div>
        </div>
        <h1>Photo Manager</h1>
        <p>Store, manage and organize your memories</p>
      </div>

      <div className="auth-panel right-panel">
        <div className="login-card">
          <h2>{titleMap[mode]}</h2>
          <p>{subtitleMap[mode]}</p>

          {mode === 'forgot' ? (
            <div className="auth-fields">
              <div className="input-wrap">
                <Mail size={16} />
                <input type="email" placeholder="Email address" defaultValue="john.doe@gmail.com" />
              </div>
              <button className="primary-button full" onClick={() => navigate('/reset-password')}>Send Reset Link</button>
            </div>
          ) : mode === 'reset' ? (
            <div className="auth-fields">
              <div className="input-wrap">
                <Lock size={16} />
                <input type="password" placeholder="New Password" defaultValue="********" />
              </div>
              <div className="input-wrap">
                <Lock size={16} />
                <input type="password" placeholder="Confirm Password" defaultValue="********" />
              </div>
              <button className="primary-button full" onClick={() => navigate('/login')}>Update Password</button>
            </div>
          ) : mode === 'verify' ? (
            <div className="auth-fields">
              <div className="verification-box">
                <div className="verification-code">6358</div>
                <div className="verification-note">Enter the six-digit code sent to your email</div>
              </div>
              <button className="primary-button full" onClick={() => navigate('/app/dashboard')}>Verify Email</button>
            </div>
          ) : (
            <div className="auth-fields">
              <div className="input-wrap">
                <Mail size={16} />
                <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="input-wrap password-wrap">
                <Lock size={16} />
                <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="eye-toggle" onClick={() => setShowPassword((prev) => !prev)} aria-label="Toggle password visibility">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {mode === 'register' ? (
                <div className="input-wrap">
                  <User size={16} />
                  <input type="text" placeholder="Full name" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
              ) : null}

              {mode === 'login' ? (
                <div className="login-options">
                  <label className="remember-me">
                    <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe((prev) => !prev)} />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="text-button" onClick={() => navigate('/forgot-password')}>Forgot password?</button>
                </div>
              ) : null}

              <AuthButtons mode={mode} navigate={navigate} email={email} password={password} username={username} />
            </div>
          )}

          {mode === 'login' ? (
            <>
              <div className="divider-row"><span>or continue with</span></div>

              <div className="social-stack">
                <button type="button" className="social-button" onClick={() => beginOAuthLogin('google')}><span className="social-icon google">G</span> Continue with Google</button>
                <button type="button" className="social-button" onClick={() => beginOAuthLogin('microsoft')}><span className="social-icon microsoft">M</span> Continue with Microsoft</button>
                <button type="button" className="social-button" onClick={() => beginOAuthLogin('apple')}><span className="social-icon apple"></span> Continue with Apple</button>
              </div>
              {oauthError ? <div style={{ color: 'var(--danger)', marginTop: 12 }}>{oauthError}</div> : null}
            </>
          ) : null}

          <div className="auth-footer">
            {mode === 'login' ? (
              <>
                <p>By continuing, you agree to our <button type="button" className="legal-link" onClick={() => navigate('/terms')}>Terms of Service</button> and <button type="button" className="legal-link" onClick={() => navigate('/privacy')}>Privacy Policy</button></p>
                <div className="signup-row">Don't have an account? <button className="text-button" onClick={() => navigate('/register')}>Create Account</button></div>
              </>
            ) : mode === 'register' ? (
              <div className="signup-row">Already have an account? <button className="text-button" onClick={() => navigate('/login')}>Sign In</button></div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function LegalPage({ type }: { type: 'terms' | 'privacy' }) {
  const navigate = useNavigate()
  const isTerms = type === 'terms'
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy'

  return (
    <div className="legal-shell">
      <article className="legal-card">
        <button type="button" className="text-button legal-back" onClick={() => navigate('/login')}>← Back to sign in</button>
        <div className="brand-mark"><div className="brand-icon">P</div></div>
        <h1>{title}</h1>
        <p className="legal-date">Effective date: September 3, 2026</p>

        {isTerms ? <>
          <section><h2>1. Using Photo Manager</h2><p>Photo Manager lets you store, organize, view and share photos. You must provide accurate account information, keep your sign-in credentials secure, and use the service lawfully.</p></section>
          <section><h2>2. Your content</h2><p>You retain ownership of photos and other content you upload. You give us permission to store, process and display that content only as needed to operate the service and provide features you choose, such as sharing.</p></section>
          <section><h2>3. Acceptable use</h2><p>Do not upload unlawful content, infringe someone else’s rights, attempt to access another person’s account, interfere with the service, or use the service to distribute malware or spam.</p></section>
          <section><h2>4. Accounts and security</h2><p>You are responsible for activity under your account. Tell us promptly if you believe your account has been accessed without permission. We may suspend accounts that violate these terms or create a security risk.</p></section>
          <section><h2>5. Service availability</h2><p>We work to keep the service available, but it may be changed, interrupted or discontinued for maintenance, security or operational reasons. Back up important photos independently.</p></section>
          <section><h2>6. Changes and contact</h2><p>We may update these terms when the service changes. Continued use after an update means you accept the revised terms. Contact the service operator if you have questions about these terms.</p></section>
        </> : <>
          <section><h2>1. Information we collect</h2><p>We collect account details such as email address and profile name, plus photos, folders, albums and settings that you create in Photo Manager. We also collect basic service and security information needed to keep your session working.</p></section>
          <section><h2>2. How we use information</h2><p>We use your information to authenticate you, store and organize your library, display your content, protect accounts, troubleshoot problems and improve the service.</p></section>
          <section><h2>3. Google, Microsoft and Apple sign-in</h2><p>If you choose a third-party sign-in provider, we receive the account identity information that provider authorizes, such as your email address and profile name. We use it to create or connect your Photo Manager account. We do not receive or store your provider password.</p></section>
          <section><h2>4. Sharing and disclosure</h2><p>Your private photos are not made public by default. Content is shared only when you use a sharing feature, when required by law, or when necessary to protect the service, users or rights of others.</p></section>
          <section><h2>5. Security and retention</h2><p>We use reasonable safeguards to protect information, but no online service can guarantee absolute security. We retain account and library data while your account is active and as needed for legitimate operational or legal purposes.</p></section>
          <section><h2>6. Your choices and contact</h2><p>You can update account details, remove content, or request account deletion through the service operator. Contact the service operator with privacy questions or requests.</p></section>
        </>}
      </article>
    </div>
  )
}

function AppShell({
  theme,
  setTheme,
  sidebarOpen,
  setSidebarOpen,
  profileOpen,
  setProfileOpen,
  notificationsOpen,
  setNotificationsOpen,
  search,
  setSearch,
  selectedView,
  setSelectedView,
  sortBy,
  setSortBy,
  activeFilter,
  setActiveFilter,
  favoriteIds,
  onToggleFavorite,
  onDeletePhoto,
  openViewer,
  filteredPhotos,
  notificationItems,
  toasts,
  removeToast,
  setShowAlbumModal,
  setShowFolderModal,
  onUploadPhotos,
  albumState,
  folderState,
  photoState,
  trashItems,
  onRestoreTrash,
  onPermanentDeleteTrash,
  onEmptyTrash,
  dashboard,
}: {
  theme: 'light' | 'dark'
  setTheme: (value: 'light' | 'dark') => void
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  profileOpen: boolean
  setProfileOpen: (value: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (value: boolean) => void
  search: string
  setSearch: (value: string) => void
  selectedView: 'grid' | 'list'
  setSelectedView: (value: 'grid' | 'list') => void
  sortBy: string
  setSortBy: (value: string) => void
  activeFilter: string
  setActiveFilter: (value: string) => void
  favoriteIds: Set<string>
  onToggleFavorite: (id: string) => void
  onDeletePhoto: (id: string) => void
  openViewer: (id: string) => void
  filteredPhotos: typeof photos
  notificationItems: typeof notifications
  toasts: Array<{ id: number; title: string; detail: string; tone: 'success' | 'info' | 'warning' }>
  removeToast: (id: number) => void
  setShowAlbumModal: (value: boolean) => void
  setShowFolderModal: (value: boolean) => void
  onUploadPhotos: () => void
  albumState: typeof albums
  folderState: typeof folders
  photoState: typeof photos
  trashItems: TrashPhotoItem[]
  onRestoreTrash: (id: string) => void
  onPermanentDeleteTrash: (id: string) => void
  onEmptyTrash: () => void
  dashboard: { photoCount: number; albumCount: number; folderCount: number; storageUsedBytes: number; storageLimitBytes: number }
}) {
  const navigate = useNavigate()
  const auth = useAuth()
  const displayName = auth.user?.username || auth.user?.email?.split('@')[0] || 'Account'
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const storagePercent = dashboard.storageLimitBytes ? Math.min(100, (dashboard.storageUsedBytes / dashboard.storageLimitBytes) * 100) : 0
  const handleProfileAction = (label: string) => {
    if (label === 'Logout') {
      auth.logout()
      navigate('/login')
      return
    }
    const destination = label === 'Profile' ? '/app/profile' : label === 'Storage' ? '/app/storage' : label === 'Preferences' ? '/app/preferences' : '/app/settings'
    setProfileOpen(false)
    navigate(destination)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-inner">
          <div className="logo-row">
            <div className="brand-icon small">P</div>
            <span>Photo Manager</span>
          </div>

          <nav className="nav-list">
            {sidebarItems.map(({ label, icon: Icon, path }) => (
              <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="storage-panel">
            <div className="storage-label">STORAGE</div>
            <div className="storage-row">
              <span>{formatBytes(dashboard.storageUsedBytes)}</span>
              <span>of {formatBytes(dashboard.storageLimitBytes)}</span>
            </div>
            <div className="storage-progress">
              <span style={{ width: `${storagePercent}%` }} />
            </div>
            <button className="primary-button full" onClick={() => navigate('/app/storage')}>View Storage</button>
          </div>

          <div className="tools-panel">
            <button className="nav-action" onClick={onUploadPhotos}><Upload size={15} /> Upload Photos</button>
            <button className="nav-action" onClick={() => setShowFolderModal(true)}><FolderPlus size={15} /> Create Folder</button>
            <button className="nav-action" onClick={() => setShowAlbumModal(true)}><Album size={15} /> Create Album</button>
          </div>

          <div className="store-links">
            <span>Get the App</span>
            <button className="store-button">Apple App Store</button>
            <button className="store-button">Google Play</button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle navigation"><Menu size={18} /></button>
            <div className="search-box">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search photos, folders..." />
            </div>
          </div>

          <div className="topbar-right">
            <button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Toggle dark mode">
              {theme === 'light' ? <Moon size={16} /> : <SunMedium size={16} />}
            </button>
            <div className="notifications-wrap">
              <button className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications">
                <Bell size={16} />
              </button>
              {notificationsOpen ? (
                <div className="notifications-panel">
                  <div className="notifications-header">
                    <strong>Notifications</strong>
                    <span>{notificationItems.length}</span>
                  </div>
                  {notificationItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="notification-item">
                      <div className="notification-dot" />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="profile-menu-wrap">
              <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}>
                <div className="avatar">{initials}</div>
                <span>{displayName}</span>
                <ChevronDown size={15} />
              </button>

              {profileOpen ? (
                <div className="profile-menu">
                  {navProfileMenu.map(({ label, icon: Icon }) => (
                    <button key={label} className="profile-menu-item" onClick={() => handleProfileAction(label)}>
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="main-content">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} onDeletePhoto={onDeletePhoto} openViewer={openViewer} onUploadPhotos={onUploadPhotos} dashboard={dashboard} recentPhotos={photoState.slice(0, 5)} />} />
            <Route path="/photos" element={<PhotosPage setSearch={setSearch} selectedView={selectedView} setSelectedView={setSelectedView} sortBy={sortBy} setSortBy={setSortBy} activeFilter={activeFilter} setActiveFilter={setActiveFilter} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} onDeletePhoto={onDeletePhoto} openViewer={openViewer} filteredPhotos={filteredPhotos} />} />
            <Route path="/albums" element={<AlbumsPage albumState={albumState} onCreateAlbum={() => setShowAlbumModal(true)} />} />
            <Route path="/folders" element={<FoldersPage folderState={folderState} onCreateFolder={() => setShowFolderModal(true)} />} />
            <Route path="/favorites" element={<FavoritesPage photos={photoState} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} onDeletePhoto={onDeletePhoto} openViewer={openViewer} />} />
            <Route path="/shared" element={<SharedPage />} />
            <Route path="/trash" element={<TrashPage items={trashItems} onRestore={onRestoreTrash} onPermanentDelete={onPermanentDeleteTrash} onEmpty={onEmptyTrash} />} />
            <Route path="/settings" element={<SettingsPage section="account" dashboard={dashboard} />} />
            <Route path="/profile" element={<SettingsPage section="profile" dashboard={dashboard} />} />
            <Route path="/storage" element={<SettingsPage section="storage" dashboard={dashboard} />} />
            <Route path="/preferences" element={<SettingsPage section="preferences" dashboard={dashboard} />} />
            <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
          </Routes>
          {toasts.length ? (
            <div className="toast-stack">
              {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.tone}`}>
                  <div>
                    <strong>{toast.title}</strong>
                    <span>{toast.detail}</span>
                  </div>
                  <button className="icon-button subtle" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification"><X size={12} /></button>
                </div>
              ))}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function DashboardPage({ favoriteIds, onToggleFavorite, onDeletePhoto, openViewer, onUploadPhotos, dashboard, recentPhotos: latestPhotos }: { favoriteIds: Set<string>; onToggleFavorite: (id: string) => void; onDeletePhoto: (id: string) => void; openViewer: (id: string) => void; onUploadPhotos: () => void; dashboard: { photoCount: number; albumCount: number; folderCount: number; storageUsedBytes: number; storageLimitBytes: number }; recentPhotos: typeof photos }) {
  const storagePercent = dashboard.storageLimitBytes ? Math.round((dashboard.storageUsedBytes / dashboard.storageLimitBytes) * 100) : 0
  const stats = [
    { title: 'Photos', value: dashboard.photoCount.toLocaleString(), growth: 'In your library', icon: ImageIcon },
    { title: 'Albums', value: dashboard.albumCount.toLocaleString(), growth: 'In your library', icon: Album },
    { title: 'Folders', value: dashboard.folderCount.toLocaleString(), growth: 'In your library', icon: Folder },
    { title: 'Storage Used', value: formatBytes(dashboard.storageUsedBytes), growth: `${storagePercent}% used`, icon: CloudUpload },
  ]

  return (
    <div className="page-block">
      <div className="stats-grid">
        {stats.map(({ title, value, growth, icon: Icon }) => (
          <div key={title} className="stats-card">
            <div className="stats-header">
              <div className="stats-icon"><Icon size={16} /></div>
              <span className="stats-growth">{growth}</span>
            </div>
            <div className="stats-value">{value}</div>
            <div className="stats-label">{title}</div>
          </div>
        ))}
      </div>

      <div className="content-header">
        <h3>Recent Photos</h3>
        <div className="button-row">
          <button className="secondary-button" onClick={() => window.history.pushState({}, '', '/app/photos')}>View All</button>
          <button className="primary-button" onClick={onUploadPhotos}>Upload Photos</button>
        </div>
      </div>

      <div className="photo-grid dashboard-grid">
        {latestPhotos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} isFavorite={favoriteIds.has(photo.id)} onToggleFavorite={onToggleFavorite} onDelete={onDeletePhoto} onOpen={openViewer} />
        ))}
      </div>
    </div>
  )
}

function PhotosPage({ setSearch, selectedView, setSelectedView, sortBy, setSortBy, activeFilter, setActiveFilter, favoriteIds, onToggleFavorite, onDeletePhoto, openViewer, filteredPhotos }: { setSearch: (value: string) => void; selectedView: 'grid' | 'list'; setSelectedView: (value: 'grid' | 'list') => void; sortBy: string; setSortBy: (value: string) => void; activeFilter: string; setActiveFilter: (value: string) => void; favoriteIds: Set<string>; onToggleFavorite: (id: string) => void; onDeletePhoto: (id: string) => void; openViewer: (id: string) => void; filteredPhotos: typeof photos }) {
  return (
    <div className="page-block">
      <div className="panel-header">
        <div>
          <h3>All Photos</h3>
          <span>{filteredPhotos.length} items</span>
        </div>
        <div className="toolbar-actions">
          <div className="view-toggle">
            <button className={selectedView === 'grid' ? 'active' : ''} onClick={() => setSelectedView('grid')}><Grid2X2 size={14} /></button>
            <button className={selectedView === 'list' ? 'active' : ''} onClick={() => setSelectedView('list')}><List size={14} /></button>
          </div>
          <div className="filter-box">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {sortOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          <button className="primary-button" onClick={() => setSearch('')}>Reset</button>
        </div>
      </div>

      <div className="filter-row">
        {filterOptions.map((filter) => (
          <button key={filter} className={`chip-button ${activeFilter === filter ? 'active' : ''}`} onClick={() => setActiveFilter(filter)}>{filter}</button>
        ))}
      </div>

      {filteredPhotos.length ? (
        <div className={selectedView === 'grid' ? 'photo-grid' : 'photo-list'}>
          {filteredPhotos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} isFavorite={favoriteIds.has(photo.id)} onToggleFavorite={onToggleFavorite} onDelete={onDeletePhoto} onOpen={openViewer} compact={selectedView === 'list'} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ImageIcon size={28} />
          <h4>No photos found</h4>
          <p>Try changing the search or upload a new photo.</p>
        </div>
      )}
    </div>
  )
}

function AlbumsPage({ albumState, onCreateAlbum }: { albumState: typeof albums; onCreateAlbum: () => void }) {
  return (
    <div className="page-block">
      <div className="content-header">
        <h3>Albums</h3>
        <button className="primary-button" onClick={onCreateAlbum}>Create Album</button>
      </div>
      <div className="album-grid">
        {albumState.map((album) => (
          <article key={album.id} className="album-card">
            <div className="album-cover" style={{ backgroundImage: `url(${album.cover})` }} />
            <div className="album-body">
              <div className="album-top-row">
                <h4>{album.name}</h4>
                <button className="icon-button subtle"><MoreHorizontal size={14} /></button>
              </div>
              <p>{album.photoCount} photos</p>
              <span>{album.createdAt}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function FoldersPage({ folderState, onCreateFolder }: { folderState: typeof folders; onCreateFolder: () => void }) {
  return (
    <div className="page-block">
      <div className="content-header">
        <h3>Folders</h3>
        <button className="primary-button" onClick={onCreateFolder}>Create Folder</button>
      </div>
      <div className="folder-list">
        {folderState.map((folder) => (
          <div key={folder.id} className="folder-row">
            <div className="folder-left">
              <div className="folder-badge" style={{ background: folder.color }} />
              <div>
                <strong>{folder.name}</strong>
                <span>{folder.count} items</span>
              </div>
            </div>
            <button className="icon-button subtle"><MoreHorizontal size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function FavoritesPage({ photos, favoriteIds, onToggleFavorite, onDeletePhoto, openViewer }: { photos: ReturnType<typeof photoStateToPhotoList>; favoriteIds: Set<string>; onToggleFavorite: (id: string) => void; onDeletePhoto: (id: string) => void; openViewer: (id: string) => void }) {
  const items = photos.filter((photo) => favoriteIds.has(photo.id))

  return (
    <div className="page-block">
      <div className="content-header">
        <h3>Favorites</h3>
        <span>{items.length} saved</span>
      </div>
      {items.length ? (
        <div className="photo-grid">
          {items.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} isFavorite onToggleFavorite={onToggleFavorite} onDelete={onDeletePhoto} onOpen={openViewer} />
          ))}
        </div>
      ) : (
        <div className="empty-state"><Heart size={28} /><h4>No favorites yet</h4><p>Mark photos as favorites to revisit them quickly.</p></div>
      )}
    </div>
  )
}

function SharedPage() {
  return (
    <div className="page-block">
      <div className="content-header">
        <h3>Shared</h3>
        <button className="primary-button">Share Photo</button>
      </div>
      <div className="photo-grid">
        {sharedPhotos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} isFavorite={photo.favorite} onToggleFavorite={() => undefined} onOpen={() => undefined} />
        ))}
      </div>
    </div>
  )
}

function TrashPage({ items, onRestore, onPermanentDelete, onEmpty }: { items: TrashPhotoItem[]; onRestore: (id: string) => void; onPermanentDelete: (id: string) => void; onEmpty: () => void }) {
  return (
    <div className="page-block">
      <div className="content-header">
        <h3>Trash</h3>
        <button className="secondary-button" onClick={onEmpty} disabled={!items.length}>Empty Trash</button>
      </div>
      {items.length ? <div className="trash-list">
        {items.map((item) => (
          <div key={item.id} className="trash-row">
            <img src={item.photo.url} alt={item.photo.name} />
            <div>
              <strong>{item.photo.name}</strong>
              <span>Deleted {new Date(item.deletedAt).toLocaleDateString()}</span>
            </div>
            <div className="trash-actions">
              <button className="secondary-button" onClick={() => onRestore(item.id)}>Restore</button>
              <button className="danger-button" onClick={() => onPermanentDelete(item.id)}>Delete permanently</button>
            </div>
          </div>
        ))}
      </div> : <div className="empty-state"><Trash2 size={28} /><h4>Trash is empty</h4><p>Photos you delete will appear here before permanent removal.</p></div>}
    </div>
  )
}

function SettingsPage({ section, dashboard }: { section: 'account' | 'profile' | 'storage' | 'preferences'; dashboard: { photoCount: number; albumCount: number; folderCount: number; storageUsedBytes: number; storageLimitBytes: number } }) {
  const { user } = useAuth()
  const displayName = user?.username || user?.email?.split('@')[0] || 'Account'
  const storagePercent = dashboard.storageLimitBytes ? Math.round((dashboard.storageUsedBytes / dashboard.storageLimitBytes) * 100) : 0
  const heading = section === 'profile' ? 'Profile' : section === 'storage' ? 'Storage' : section === 'preferences' ? 'Preferences' : 'Account Settings'

  return (
    <div className="page-block settings-page">
      <div className="content-header"><h3>{heading}</h3></div>
      <div className="settings-grid">
        {(section === 'profile' || section === 'account') ? <section className="settings-card">
          <h4>Profile</h4>
          <div className="field-row"><span>Name</span><strong>{displayName}</strong></div>
          <div className="field-row"><span>Email</span><strong>{user?.email || '—'}</strong></div>
        </section> : null}
        {(section === 'storage' || section === 'account') ? <section className="settings-card">
          <h4>Storage</h4>
          <div className="field-row"><span>Used</span><strong>{formatBytes(dashboard.storageUsedBytes)}</strong></div>
          <div className="field-row"><span>Limit</span><strong>{formatBytes(dashboard.storageLimitBytes)}</strong></div>
          <div className="field-row"><span>Usage</span><strong>{storagePercent}%</strong></div>
        </section> : null}
        {(section === 'preferences' || section === 'account') ? <section className="settings-card">
          <h4>Preferences</h4>
          <div className="field-row"><span>Theme</span><strong>Use the top-bar theme switch</strong></div>
          <div className="field-row"><span>Library</span><strong>{dashboard.photoCount} photos</strong></div>
        </section> : null}
      </div>
    </div>
  )
}

function PhotoCard({ photo, isFavorite, onToggleFavorite, onDelete, onOpen, compact = false }: { photo: (typeof photos)[number]; isFavorite: boolean; onToggleFavorite: (id: string) => void; onDelete?: (id: string) => void; onOpen: (id: string) => void; compact?: boolean }) {
  return (
    <article className={`photo-card ${compact ? 'compact' : ''}`}>
      <div className="photo-image-wrap" onClick={() => onOpen(photo.id)}>
        <img src={photo.url} alt={photo.name} className="photo-image" />
        <div className="photo-overlay">
          <button className="mini-action" onClick={(event) => { event.stopPropagation(); onToggleFavorite(photo.id) }} aria-label="Toggle favorite">
            <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button className="mini-action" onClick={(event) => { event.stopPropagation(); onOpen(photo.id) }} aria-label="Open photo"><Eye size={14} /></button>
          {onDelete ? <button className="mini-action danger-mini-action" onClick={(event) => { event.stopPropagation(); onDelete(photo.id) }} aria-label="Move photo to trash"><Trash2 size={14} /></button> : null}
        </div>
      </div>

      <div className="photo-meta">
        <div>
          <strong>{photo.name}</strong>
          <span>{photo.date}</span>
        </div>
        <button className="icon-button subtle" aria-label="More actions"><MoreHorizontal size={14} /></button>
      </div>
      <div className="photo-details-row"><span>{photo.size}</span><span>{photo.folder}</span></div>
    </article>
  )
}

function photoStateToPhotoList() {
  return photos
}

function AuthButtons({ mode, navigate, email, password, username }: { mode: string; navigate: any; email: string; password: string; username: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuth()

  useEffect(() => setError(null), [mode])

  const handle = async () => {
    setLoading(true)
    setError(null)
    try {
      const base = import.meta.env.DEV ? 'http://localhost:4000' : ''
      const url = (mode === 'register' ? '/api/register' : '/api/login')
      const full = base + url
      const body: any = { email, password }
      if (mode === 'register') body.username = username
      const res = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Auth failed')
      auth.login(data.token, data.user)
      navigate('/app/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button className="primary-button full" onClick={handle} disabled={loading}>
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Continue'}
      </button>
      {error ? <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div> : null}
    </>
  )
}

export default App
