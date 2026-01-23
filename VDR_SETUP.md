# VDR Setup & Running Instructions

## Quick Start

### 1. Install Dependencies (if not already done)

```bash
# From project root
npm install

# Or specifically for web app
cd apps/web
npm install
```

### 2. Run Development Server

```bash
# Option A: From project root (runs all apps)
npm run dev

# Option B: From project root (web only)
npm run dev:web

# Option C: From apps/web directory
cd apps/web
npm run dev
```

### 3. Access VDR

Open your browser and navigate to:
```
http://localhost:3000/vdr.html
```

## Production Build

```bash
# From project root
npm run build

# Or from apps/web
cd apps/web
npm run build
```

Build outputs to: `apps/web/dist/`

To preview production build:
```bash
cd apps/web
npm run preview
```

## File Structure

```
apps/web/
├── src/
│   ├── components/          # React components
│   │   ├── FolderTree.tsx
│   │   ├── FileTable.tsx
│   │   ├── FiltersBar.tsx
│   │   └── InsightsPanel.tsx
│   ├── data/
│   │   └── vdrMockData.ts   # Mock data source
│   ├── types/
│   │   └── vdr.types.ts     # TypeScript types
│   ├── vdr.tsx              # Main VDR component
│   ├── main.tsx             # React entry point
│   └── index.css            # Styles
├── vdr.html                 # HTML entry point
├── tailwind.config.js       # Tailwind config
├── postcss.config.js        # PostCSS config
├── vite.config.ts           # Vite config
└── VDR_README.md            # Full documentation
```

## Testing Features

### 1. Folder Navigation
- Click on folders in the left sidebar
- Use Tab + Enter/Space for keyboard navigation
- Watch file list update in center panel
- See insights change in right panel

### 2. Search & Filters
- Type in search box to filter by filename, description, or tags
- Click smart filter chips to activate filters
- Multiple filters can be active simultaneously
- Try: "Contains Change of Control" to see highlighted file

### 3. File Upload
- Click "Upload Files" button in header
- Select one or more files (PDF, Excel, Word)
- Files must be under 50MB
- Watch files appear in list with "Processing..." status
- After 2 seconds, status changes to "Analysis Complete"

### 4. Report Generation
- Select a folder (e.g., "100 Financials")
- Scroll to right panel
- Click "Generate Full Report" button at bottom
- Check Downloads folder for markdown (.md) file

### 5. Red Flags & Missing Docs
- Select "100 Financials" folder
- See red flags in right panel
- Click "View File" on a red flag (shows alert)
- Click "Request" on missing document (shows alert)

## Customization

### Change Mock Data

Edit `apps/web/src/data/vdrMockData.ts`:

```typescript
// Add a new folder
export const mockFolders: Folder[] = [
  {
    id: '600',
    name: '600 Marketing',
    status: 'ready',
    readinessPercent: 100,
    fileCount: 42,
    statusLabel: '100% Ready',
    statusColor: 'green',
  },
  // ... existing folders
];

// Add a new file
export const mockFiles: VDRFile[] = [
  {
    id: 'f10',
    name: 'Marketing_Plan_2024.pdf',
    size: '5.2 MB',
    type: 'pdf',
    folderId: '600',
    // ... other properties
  },
];
```

### Change File Upload Limits

Edit `apps/web/src/vdr.tsx`:

```typescript
const maxFileSize = 100 * 1024 * 1024; // Change to 100MB

const allowedTypes = [
  'application/pdf',
  'image/png',  // Add PNG support
  'image/jpeg', // Add JPEG support
  // ... existing types
];
```

### Add New Smart Filter

Edit `apps/web/src/data/vdrMockData.ts`:

```typescript
export const smartFilters: SmartFilter[] = [
  {
    id: 'my-custom-filter',
    label: 'My Custom Filter',
    icon: 'filter_list',
    active: false,
    filterFn: (file) => {
      // Your custom filter logic
      return file.name.includes('Custom');
    },
  },
  // ... existing filters
];
```

## Troubleshooting

### Build Errors

```bash
# Clear build cache
rm -rf apps/web/dist
rm -rf apps/web/node_modules/.vite

# Rebuild
npm run build
```

### Port Already in Use

Edit `apps/web/vite.config.ts`:

```typescript
server: {
  port: 3001, // Change port
  open: true,
},
```

### TypeScript Errors

```bash
# Check TypeScript
cd apps/web
npx tsc --noEmit
```

## Browser DevTools Tips

1. **React DevTools**: Install React DevTools extension to inspect component state
2. **Console**: Check console for any runtime errors
3. **Network**: Monitor file uploads in Network tab
4. **Elements**: Inspect DOM to verify pixel-perfect design preservation

## Known Limitations

1. **No persistence**: Uploaded files are lost on page refresh
2. **No backend**: All data is mock data in memory
3. **No authentication**: Anyone can access the VDR
4. **Client-side only**: Search and filtering happen in browser

These are intentional for the mock/demo phase. Ready for backend integration when needed.

## Next Steps

To connect to a real backend:

1. Replace mock data with API calls in `vdr.tsx`
2. Implement file upload to S3/backend storage
3. Add authentication/authorization
4. Move search/filtering to backend for scalability
5. Add real AI document processing

See `VDR_README.md` for full documentation.

## Support

For issues or questions:
- Check `VDR_README.md` for detailed documentation
- Review TypeScript types in `vdr.types.ts`
- Inspect mock data in `vdrMockData.ts`
- Check browser console for errors

## Tech Stack Summary

- **Framework**: React 18.3.0
- **Language**: TypeScript 5.3.0
- **Build Tool**: Vite 5.0.0
- **Styling**: Tailwind CSS 3.4.0
- **Icons**: Material Symbols
- **Fonts**: Google Fonts (Inter)

All dependencies are already installed via `npm install` at project root.
