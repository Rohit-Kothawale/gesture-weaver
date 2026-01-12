# 3D Sign Language Visualizer

A real-time 3D sign language visualization application that captures hand movements via webcam and renders them on interactive 3D avatars.

## Features

### 🎥 Real-Time Motion Capture
- Capture hand and arm movements using your webcam
- Powered by MediaPipe Holistic for full upper-body tracking
- Live 3D preview while recording

### 🎭 Multiple Visualization Modes
- **Cartoon Avatar**: Geometric character with full body, arms, and articulated fingers
- **Hands Only**: Detailed hand skeleton with optional arm visualization
- **Skin Layer**: Anatomical hand rendering with realistic finger segments

### 📊 Animation Playback
- Play/pause controls with adjustable speed (5-30 FPS)
- Frame-by-frame scrubbing via timeline slider
- Visual indicators for current frame and total frames

### 💾 Data Import/Export
- Export captured movements as CSV files
- Import existing CSV data for playback
- Full support for hand landmarks (21 points per hand) and arm coordinates (shoulder, elbow, wrist)

### 🎨 Visual Design
- Dark-themed modern interface
- Color-coded hands: Blue/Cyan (left) and Green/Emerald (right)
- Responsive layout with controls sidebar

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **3D Rendering**: Three.js via React Three Fiber & Drei
- **Motion Tracking**: MediaPipe Holistic/Hands
- **Styling**: Tailwind CSS, shadcn/ui
- **Data Handling**: PapaParse for CSV operations

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or bun

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to project directory
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

### Usage

1. **View Sample Data**: The app loads sample sign language data on startup
2. **Capture New Movements**: 
   - Click the camera icon to open capture modal
   - Allow webcam access
   - Perform hand gestures in front of the camera
   - Click "Save Movement" to store the recording
3. **Switch Views**: Toggle between "Avatar" and "Hands Only" modes
4. **Export Data**: Download your captured movements as CSV for later use
5. **Import Data**: Upload existing CSV files to visualize saved movements

## CSV Data Format

The CSV format includes:
- `label`: Sign/gesture identifier
- Hand landmarks: `L0_x` through `L20_z` (left) and `R0_x` through `R20_z` (right)
- Arm landmarks: `LA_shoulder_x/y/z`, `LA_elbow_x/y/z`, `LA_wrist_x/y/z` (left arm)
- Arm landmarks: `RA_shoulder_x/y/z`, `RA_elbow_x/y/z`, `RA_wrist_x/y/z` (right arm)

## Controls

| Control | Action |
|---------|--------|
| Play/Pause | Start or stop animation playback |
| Speed Slider | Adjust playback speed (5-30 FPS) |
| Timeline | Scrub through animation frames |
| Show Arms | Toggle arm skeleton in Hands Only view |
| View Toggle | Switch between Avatar and Hands Only modes |

## License

MIT

## Acknowledgments

- [MediaPipe](https://mediapipe.dev/) for hand tracking models
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) for 3D rendering
- [shadcn/ui](https://ui.shadcn.com/) for UI components
