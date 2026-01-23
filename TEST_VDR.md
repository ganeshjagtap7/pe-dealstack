# VDR Testing Checklist

## ✅ Server is Running!

Your development server is now running at: **http://localhost:3000**

## How to Access VDR

1. **Open your browser** (Chrome, Firefox, Safari, or Edge)
2. **Navigate to:** `http://localhost:3000/vdr.html`
3. You should see the VDR interface with 3 panels

## Visual Verification

When the page loads, you should see:

### Left Sidebar (280px width)
- ✅ "PROJECT APEX" header
- ✅ "Data Room Index" title
- ✅ 5 folders listed:
  - **100 Financials** (highlighted in blue, 92% Ready badge, 142 files)
  - 200 Legal (orange "Attention" badge, 84 files)
  - 300 Commercial (88% Ready badge, 56 files)
  - 400 HR & Data (yellow "Reviewing" badge, 23 files)
  - 500 Intellectual Property (lock icon, "Access Restricted")
- ✅ "New Folder" button at bottom

### Center Panel (Main Area)
- ✅ **Breadcrumbs**: "Project Apex > 100 Financials"
- ✅ **Collaborators**: 2 avatars + "+4" badge
- ✅ **Upload Files** button (black)
- ✅ **Search bar**: "Ask AI to filter files..."
- ✅ **Smart filter chips**:
  - "Contains Change of Control" (active/blue)
  - "EBITDA Adjustments"
  - "High Risk Flags"
  - "FY 2023 Only"
  - "+ Custom"
- ✅ **File table** with 4 files showing:
  - Q3_2023_Mgmt_Accounts.xlsx
  - Executive_Comp_Agreements.pdf (highlighted row)
  - Audit_Report_FY22.docx
  - Cap_Table_Current.xlsx

### Right Sidebar (320px width)
- ✅ **AI Quick Insights** header with robot icon
- ✅ **Summary section**: "The financials folder is 92% complete..."
- ✅ **Red Flags (2 Found)**:
  - Unsigned Employment Agreement (red)
  - Revenue Anomaly (orange)
- ✅ **Missing Documents**:
  - Q4 2022 Board Minutes
  - Insurance Policies 2024
- ✅ **Generate Full Report** button (black) at bottom

## Interactive Testing

### Test 1: Folder Navigation ✅
1. Click on "200 Legal" in the left sidebar
2. **Expected**:
   - Folder highlights in blue
   - File list updates to show 1 file (Shareholder_Agreement.pdf)
   - Breadcrumb changes to "Project Apex > 200 Legal"
   - Right panel updates with different insights

### Test 2: Search Functionality ✅
1. Click in the search box
2. Type "EBITDA"
3. **Expected**: File list filters to show only "EBITDA_Adjustments_FY23.xlsx"
4. Clear search (delete text)
5. **Expected**: All files reappear

### Test 3: Smart Filters ✅
1. Click on "Change of Control" chip (should already be active/blue)
2. **Expected**: File list shows only "Executive_Comp_Agreements.pdf"
3. Click "EBITDA Adjustments" chip
4. **Expected**: Both filters active, file list shows files matching EITHER filter
5. Click "Change of Control" again to deactivate
6. **Expected**: Shows only EBITDA file

### Test 4: File Upload ✅
1. Click **"Upload Files"** button in header
2. Select any PDF, Excel, or Word file (under 50MB)
3. **Expected**:
   - File appears at top of list with "Processing..." status
   - After 2 seconds, status changes to "Analysis Complete"
4. Try uploading a large file (>50MB)
5. **Expected**: Alert shows "File exceeds maximum size"

### Test 5: Report Generation ✅
1. Make sure "100 Financials" folder is selected
2. Scroll down in right panel
3. Click **"Generate Full Report"** button
4. **Expected**:
   - File downloads automatically
   - Filename: `VDR_Report_100_Financials_[timestamp].md`
   - Open file to see markdown report with summary, red flags, files

### Test 6: Red Flag Actions ✅
1. In right panel, find "Unsigned Employment Agreement" red flag
2. Click **"View File"** button
3. **Expected**: Alert shows "File clicked: Executive_Comp_Agreements.pdf"

### Test 7: Missing Document Request ✅
1. In right panel, find "Q4 2022 Board Minutes"
2. Click **"Request"** button
3. **Expected**: Alert shows "Document request sent: Q4 2022 Board Minutes"

### Test 8: Keyboard Navigation ✅
1. Press **Tab** key multiple times
2. **Expected**: Focus moves through folders in left sidebar
3. When a folder is focused, press **Enter** or **Space**
4. **Expected**: Folder selects and file list updates

### Test 9: File Click ✅
1. Click on any file row in the table
2. **Expected**: Alert shows file name and message about file viewer

### Test 10: Multiple Filters ✅
1. Select "100 Financials" folder
2. Type "2023" in search box
3. Click "High Risk Flags" chip
4. **Expected**: Shows files that match BOTH search AND filter

## Browser Console Check

Open browser DevTools (F12 or Right-click > Inspect):

### Console Tab
- ✅ Should have NO red errors
- ✅ May have some React DevTools info messages (OK)
- ✅ May have HMR (Hot Module Replacement) messages (OK)

### React DevTools (if installed)
- ✅ You can see component tree
- ✅ VDRApp > FolderTree, FileTable, InsightsPanel components

## Performance Check

### Load Time
- ✅ Page should load in under 2 seconds
- ✅ No flickering or layout shifts
- ✅ All images/fonts load properly

### Interactions
- ✅ Folder clicks are instant
- ✅ Search filtering is instant
- ✅ No lag when typing in search

## Mobile Responsive (Bonus)

1. Press **F12** to open DevTools
2. Click **Toggle Device Toolbar** icon (or Ctrl+Shift+M)
3. Select a mobile device (e.g., iPhone 12)
4. **Expected**: Layout adjusts but may need horizontal scroll (design was desktop-first)

## Known Behavior (Not Bugs)

1. **Restricted folder (500)**: Cannot be clicked - this is intentional
2. **Alerts for actions**: File viewing and document requests show alerts - placeholders for real functionality
3. **File upload**: Files are stored in memory only - refresh will clear them
4. **Search is case-insensitive**: Searching "ebitda" finds "EBITDA"
5. **Filter combinations use AND logic**: Both conditions must match

## Troubleshooting

### Page Not Loading?
- Check the URL is exactly: `http://localhost:3000/vdr.html`
- Try refreshing the page (Cmd+R / Ctrl+R)
- Check browser console for errors

### Server Not Running?
```bash
cd /Users/ganesh/AI\ CRM/apps/web
npm run dev
```

### Port 3000 Already in Use?
```bash
# Kill existing process
lsof -ti:3000 | xargs kill -9

# Restart server
npm run dev
```

### Build Errors?
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
rm -rf dist
npm run build
```

### TypeScript Errors?
```bash
# Check types
npx tsc --noEmit
```

## Success Criteria

If all these are working, the implementation is successful:

- [x] All 5 folders are visible and 4 are clickable
- [x] Clicking folders updates file list
- [x] Search filters files correctly
- [x] Smart filters work individually and combined
- [x] File upload accepts valid files
- [x] File upload rejects invalid files (size/type)
- [x] Report generation downloads .md file
- [x] Red flag "View File" shows alert
- [x] Missing doc "Request" shows alert
- [x] Keyboard navigation works
- [x] UI matches original design pixel-perfectly
- [x] No console errors
- [x] Build completes successfully

## Next Steps After Testing

Once you've verified everything works:

1. **Stop the dev server**: Ctrl+C in terminal
2. **Review documentation**: Check `VDR_README.md` for full details
3. **Customize data**: Edit `apps/web/src/data/vdrMockData.ts`
4. **Plan backend integration**: See "Next Steps" in VDR_README.md

## Quick Commands Reference

```bash
# Start dev server
npm run dev:web

# Build for production
npm run build

# Preview production build
npm run preview

# Check TypeScript
npx tsc --noEmit

# Stop server (if running in terminal)
Ctrl + C
```

---

**Current Status**: ✅ Dev server is running at http://localhost:3000

**Access VDR**: Open browser → `http://localhost:3000/vdr.html`

**Stop Server**: Press Ctrl+C in the terminal where server is running
