export type Photo = {
  id: string
  name: string
  url: string
  size: string
  date: string
  resolution: string
  folder: string
  albums: string[]
  favorite: boolean
  shared?: boolean
  tags: string[]
}

export type Album = {
  id: string
  name: string
  cover: string
  photoCount: number
  createdAt: string
  description: string
}

export type Folder = {
  id: string
  name: string
  parent?: string
  count: number
  color: string
}

export type NotificationItem = {
  id: string
  title: string
  detail: string
  time: string
  tone: 'info' | 'success' | 'warning'
}

export const photos: Photo[] = [
  {
    id: 'p1',
    name: 'mountain-lake.jpg',
    url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
    size: '2.4 MB',
    date: '2025-01-10',
    resolution: '3840 × 2160',
    folder: 'Trips',
    albums: ['Winter Escape'],
    favorite: true,
    shared: true,
    tags: ['lake', 'mountain', 'travel'],
  },
  {
    id: 'p2',
    name: 'girl-portrait.jpg',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    size: '1.9 MB',
    date: '2025-02-12',
    resolution: '2400 × 3200',
    folder: 'People',
    albums: ['Portraits'],
    favorite: false,
    shared: false,
    tags: ['portrait', 'woman', 'outdoor'],
  },
  {
    id: 'p3',
    name: 'forest-path.jpg',
    url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    size: '3.2 MB',
    date: '2024-12-24',
    resolution: '3000 × 2000',
    folder: 'Nature',
    albums: ['Forest Mood'],
    favorite: true,
    shared: true,
    tags: ['forest', 'sunlight'],
  },
  {
    id: 'p4',
    name: 'waterfall.jpg',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
    size: '2.7 MB',
    date: '2025-03-04',
    resolution: '3200 × 2100',
    folder: 'Nature',
    albums: ['World Wonders'],
    favorite: false,
    shared: false,
    tags: ['waterfall', 'nature'],
  },
  {
    id: 'p5',
    name: 'city-night.jpg',
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=900&q=80',
    size: '2.1 MB',
    date: '2025-03-18',
    resolution: '4000 × 2000',
    folder: 'City',
    albums: ['Night Lights'],
    favorite: false,
    shared: true,
    tags: ['city', 'night'],
  },
  {
    id: 'p6',
    name: 'sunset-beach.jpg',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    size: '1.7 MB',
    date: '2025-05-09',
    resolution: '3000 × 2000',
    folder: 'Travel',
    albums: ['Holiday'],
    favorite: true,
    tags: ['beach', 'sunset'],
  },
  {
    id: 'p7',
    name: 'road-trip.jpg',
    url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    size: '2.9 MB',
    date: '2025-06-15',
    resolution: '2800 × 1900',
    folder: 'Road',
    albums: ['Adventures'],
    favorite: false,
    tags: ['road', 'car', 'trip'],
  },
  {
    id: 'p8',
    name: 'flower-macro.jpg',
    url: 'https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=900&q=80',
    size: '2.6 MB',
    date: '2025-04-15',
    resolution: '2500 × 3100',
    folder: 'Nature',
    albums: ['Flowers'],
    favorite: true,
    tags: ['flower', 'macro', 'pink'],
  },
  {
    id: 'p9',
    name: 'lake-boats.jpg',
    url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
    size: '3.4 MB',
    date: '2024-09-19',
    resolution: '4200 × 2800',
    folder: 'Trips',
    albums: ['Lake Days'],
    favorite: false,
    tags: ['boats', 'lake', 'summer'],
  },
  {
    id: 'p10',
    name: 'tropical-beach.jpg',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    size: '2.3 MB',
    date: '2024-11-22',
    resolution: '3000 × 2000',
    folder: 'Travel',
    albums: ['Beach'],
    favorite: false,
    tags: ['beach', 'water', 'holiday'],
  },
  {
    id: 'p11',
    name: 'forest-glow.jpg',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
    size: '2.5 MB',
    date: '2025-07-21',
    resolution: '3700 × 2200',
    folder: 'Nature',
    albums: ['Forest Mood'],
    favorite: true,
    tags: ['forest', 'green'],
  },
  {
    id: 'p12',
    name: 'desert-dunes.jpg',
    url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    size: '3.1 MB',
    date: '2025-08-08',
    resolution: '3500 × 2600',
    folder: 'Trips',
    albums: ['Adventures'],
    favorite: false,
    tags: ['desert', 'dunes'],
  },
]

export const albums: Album[] = [
  {
    id: 'a1',
    name: 'Winter Escape',
    cover: photos[0].url,
    photoCount: 8,
    createdAt: 'Jan 14, 2025',
    description: 'Mountain retreats and snowy stillness.',
  },
  {
    id: 'a2',
    name: 'Portraits',
    cover: photos[1].url,
    photoCount: 12,
    createdAt: 'Mar 03, 2025',
    description: 'Faces, stories, and close-ups.',
  },
  {
    id: 'a3',
    name: 'Forest Mood',
    cover: photos[2].url,
    photoCount: 15,
    createdAt: 'May 06, 2025',
    description: 'Layered greens and peaceful hikes.',
  },
  {
    id: 'a4',
    name: 'Night Lights',
    cover: photos[4].url,
    photoCount: 6,
    createdAt: 'Jun 11, 2025',
    description: 'Late city glow and motion blur.',
  },
]

export const folders: Folder[] = [
  { id: 'f1', name: 'All Photos', count: 128, color: '#4f46e5' },
  { id: 'f2', name: 'Trips', parent: 'All Photos', count: 46, color: '#38bdf8' },
  { id: 'f3', name: 'Nature', parent: 'All Photos', count: 31, color: '#34d399' },
  { id: 'f4', name: 'People', parent: 'All Photos', count: 22, color: '#f59e0b' },
  { id: 'f5', name: 'City', parent: 'All Photos', count: 18, color: '#f472b6' },
]

export const notifications: NotificationItem[] = [
  { id: 'n1', title: 'Upload complete', detail: '18 photos uploaded to your library.', time: '2m ago', tone: 'success' },
  { id: 'n2', title: 'Storage warning', detail: 'You are at 82% of your 2 TB plan.', time: '42m ago', tone: 'warning' },
  { id: 'n3', title: 'Shared album updated', detail: 'Canyon Escape was shared with 4 friends.', time: '1h ago', tone: 'info' },
  { id: 'n4', title: 'New sign-in', detail: 'Signed in from a new device on Safari.', time: 'Yesterday', tone: 'info' },
]

export const recentPhotos = photos.slice(0, 5)
export const favoritePhotos = photos.filter((photo) => photo.favorite)
export const sharedPhotos = photos.filter((photo) => photo.shared)
