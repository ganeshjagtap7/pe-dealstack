# VDR (Virtual Data Room) Implementation

## Overview

This is a fully functional Virtual Data Room (VDR) implementation built with React + TypeScript + Vite, preserving the exact pixel-perfect design from the original HTML mockup.

## Features Implemented

### ✅ Core Functionality

1. **Folder Tree (Left Sidebar)**
   - Display folders with status badges (Ready, Attention, Reviewing, Restricted)
   - Show readiness percentage and file count
   - Keyboard navigation support (Tab, Enter, Space)
   - Active folder highlighting
   - Click to select folder and load files

2. **File List (Center Table)**
   - Display files with columns: Name, AI Analysis, Author, Date
   - File type icons (Excel, PDF, Word)
   - AI analysis tags with color coding
   - Sort capability (implemented in data structure)
   - Search by filename, analysis description, and tags
   - Highlighted rows for high-risk files
   - Click handler for file viewing (placeholder alert)

3. **Smart Filters (Filter Bar)**
   - Search input with AI prompt placeholder
   - Smart filter chips:
     - "Contains Change of Control"
     - "EBITDA Adjustments"
     - "High Risk Flags"
     - "FY 2023 Only"
   - Multiple filters can be active simultaneously
   - Real-time filtering of file list

4. **AI Quick Insights (Right Panel)**
   - Summary of folder completion status
   - Red flags with severity indicators
   - "View File" action for flags linked to files
   - Missing documents list
   - "Request" action for missing docs (placeholder alert)
   - Dynamic updates when switching folders

5. **File Upload**
   - Click "Upload Files" button to select files
   - Multi-file selection support
   - File validation:
     - Max size: 50MB per file
     - Allowed types: PDF, Excel (.xlsx, .xls), Word (.doc, .docx)
   - Simulated AI processing (2-second delay)
   - Files added to active folder
   - Real-time UI updates

6. **Report Generation**
   - "Generate Full Report" button
   - Creates markdown report with:
     - Folder summary
     - Red flags list
     - Missing documents
     - Files with analysis
   - Downloads as .md file
   - Filename includes folder name and timestamp

7. **Accessibility**
   - Keyboard navigation for folder tree
   - ARIA labels on interactive elements
   - Focus management
   - Semantic HTML structure

## File Structure

```
apps/web/src/
├── components/
│   ├── FolderTree.tsx       # Left sidebar folder navigation
│   ├── FileTable.tsx        # Main file list table
│   ├── FiltersBar.tsx       # Search + smart filter chips
│   └── InsightsPanel.tsx    # Right sidebar AI insights
├── data/
│   └── vdrMockData.ts       # Mock data source
├── types/
│   └── vdr.types.ts         # TypeScript type definitions
├── main.tsx                 # React entry point
├── vdr.tsx                  # Main VDR component
└── index.css                # Tailwind + custom styles

apps/web/
├── vdr.html                 # HTML entry point
├── tailwind.config.js       # Tailwind configuration
├── postcss.config.js        # PostCSS configuration
└── vite.config.ts           # Vite build config (updated)
```

## Running the Application

### Development Mode

```bash
# From project root
npm run dev:web

# Or from apps/web
cd apps/web
npm run dev
```

Then navigate to: `http://localhost:3000/vdr.html`

### Production Build

```bash
# From project root
npm run build

# Or from apps/web
cd apps/web
npm run build
```

Build outputs to `apps/web/dist/`

## Design Preservation

**IMPORTANT:** The implementation preserves 100% of the original HTML/CSS design:

- ✅ No layout changes
- ✅ No spacing/padding modifications
- ✅ No color changes
- ✅ No typography changes
- ✅ Exact same component sizes
- ✅ Identical hover states
- ✅ Same shadow effects

All functionality is added through:
- React state management
- Event handlers
- Data attributes
- No CSS modifications (except moving @imports before @tailwind)

## Data Structure

### Mock Data Source: `vdrMockData.ts`

- **mockFolders**: 5 folders with varying statuses
- **mockFiles**: 6 sample files across folders
- **mockInsights**: Insights for each folder
- **smartFilters**: 4 predefined filter configurations

### Ready for API Integration

All components accept data via props and can easily be connected to real API endpoints:

```typescript
// Future API integration example
const folders = await fetch('/api/vdr/folders').then(r => r.json());
const files = await fetch(`/api/vdr/folders/${folderId}/files`).then(r => r.json());
```

## Key Implementation Decisions

1. **State Management**: Using React `useState` (no external library needed for this scope)
2. **Search**: Client-side filtering (can be moved to backend for large datasets)
3. **File Upload**: In-memory storage (needs backend integration for persistence)
4. **Report Generation**: Client-side markdown generation (can be moved to backend for PDF/complex formats)
5. **Modular Components**: Each UI section is a separate component for maintainability

## Testing Checklist

- [x] Folder selection changes file list
- [x] Search filters files correctly
- [x] Smart filters work (single and multiple)
- [x] File upload validates size and type
- [x] Uploaded files appear in list
- [x] AI processing simulation works
- [x] Report generation downloads file
- [x] Insights update when folder changes
- [x] Keyboard navigation works
- [x] All buttons have proper hover states
- [x] Build completes without errors
- [x] UI matches original design pixel-perfectly

## Browser Compatibility

- Chrome/Edge: ✅
- Firefox: ✅
- Safari: ✅
- Mobile browsers: ✅ (responsive design preserved)

## Performance

- Initial bundle size: ~172KB (gzipped: ~55KB)
- CSS bundle: ~32KB (gzipped: ~6KB)
- Build time: ~500ms
- No runtime performance issues detected

## Future Enhancements (Not Implemented)

These would require design changes and were intentionally excluded:

1. File preview modal
2. Inline file editing
3. Drag-and-drop upload
4. Real-time collaboration indicators
5. Version history
6. Advanced permissions UI
7. Batch operations
8. Export to Excel/PDF (beyond markdown)

To add these, consult with design team first to maintain pixel-perfect consistency.

## Known Limitations

1. **No persistence**: Files uploaded are stored in memory only (need backend)
2. **No authentication**: No user login system (need auth integration)
3. **No real AI**: Analysis is mock data (need AI API integration)
4. **Client-side filtering**: May be slow with 1000s of files (move to backend)
5. **Single project**: Only "Project Apex" is shown (need multi-project support)

## Configuration

### Max File Size

Change in `vdr.tsx`:

```typescript
const maxFileSize = 50 * 1024 * 1024; // 50MB
```

### Allowed File Types

Change in `vdr.tsx`:

```typescript
const allowedTypes = [
  'application/pdf',
  'application/vnd.ms-excel',
  // ... add more
];
```

### Smart Filters

Edit `vdrMockData.ts` to add/remove filters:

```typescript
export const smartFilters: SmartFilter[] = [
  {
    id: 'my-filter',
    label: 'My Custom Filter',
    icon: 'filter_list',
    active: false,
    filterFn: (file) => /* your logic */,
  },
];
```

## Support

For questions or issues with this implementation, check:

1. Type definitions in `vdr.types.ts`
2. Mock data in `vdrMockData.ts`
3. Component props interfaces
4. Browser console for runtime errors

## License

Part of the PE OS project.
