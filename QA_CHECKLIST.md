# PE OS - Manual QA Checklist

Pre-launch quality assurance checklist for testing all features manually.

## Test Environment Setup

- [ ] Fresh browser (incognito/private mode)
- [ ] Clear localStorage and cookies
- [ ] Test on latest Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on mobile viewport (responsive)

---

## 1. Authentication

### 1.1 Signup Flow
- [ ] Navigate to `/signup.html`
- [ ] Fill all required fields (name, email, password, firm, role)
- [ ] Password strength indicator works
- [ ] Password confirmation validation works
- [ ] Submit form successfully
- [ ] Email verification email received (if enabled)
- [ ] Click verification link → redirects to verify-email.html
- [ ] Auto-redirect to login after verification

### 1.2 Login Flow
- [ ] Navigate to `/login.html`
- [ ] Login with valid credentials
- [ ] Redirects to CRM page on success
- [ ] Error message shown for invalid credentials
- [ ] Error message shown for unverified email
- [ ] "Remember me" checkbox works

### 1.3 Password Reset
- [ ] Click "Forgot password" link on login page
- [ ] Enter email address
- [ ] Reset email received
- [ ] Click reset link → opens reset-password.html
- [ ] Enter new password
- [ ] Password requirements enforced
- [ ] Success message shown
- [ ] Can login with new password

### 1.4 Logout
- [ ] Click logout button in header
- [ ] Session cleared
- [ ] Redirects to login page
- [ ] Protected pages redirect to login

---

## 2. Dashboard

### 2.1 Page Load
- [ ] Dashboard loads without errors
- [ ] Stats cards display correct data
- [ ] Recent deals list populated
- [ ] Activity feed shows recent activity

### 2.2 Portfolio Search (AI)
- [ ] Type a query in search bar
- [ ] AI response modal appears
- [ ] Response is relevant to query
- [ ] Related deals shown if applicable
- [ ] Modal can be closed

### 2.3 Navigation
- [ ] All sidebar links work
- [ ] Active page highlighted
- [ ] Mobile menu works on small screens

---

## 3. CRM / Deals List

### 3.1 Page Load
- [ ] CRM page loads without errors
- [ ] All deals displayed in cards
- [ ] Deal count shown correctly

### 3.2 Filtering
- [ ] Stage filter works
- [ ] Industry filter works (dynamic)
- [ ] Status filter works
- [ ] Clear filters button works
- [ ] Filter combinations work together

### 3.3 Search
- [ ] Search by deal name works
- [ ] Search is case-insensitive
- [ ] Results update as you type

### 3.4 Deal Cards
- [ ] Deal name displayed
- [ ] Stage badge shows correct color
- [ ] Financial metrics shown
- [ ] Click card → navigates to deal page

### 3.5 Create New Deal
- [ ] Click "New Deal" button
- [ ] Modal opens
- [ ] Fill required fields
- [ ] Submit successfully
- [ ] New deal appears in list
- [ ] Error shown for missing fields

---

## 4. Deal Detail Page

### 4.1 Page Load
- [ ] Deal page loads without errors
- [ ] Deal name shown in header
- [ ] All tabs visible

### 4.2 Overview Tab
- [ ] Company info displayed
- [ ] Financial metrics displayed
- [ ] AI thesis shown
- [ ] Stage pipeline visible

### 4.3 Documents Tab
- [ ] Document list loads
- [ ] Upload button visible
- [ ] Click document → preview works
- [ ] Document metadata shown

### 4.4 Document Upload
- [ ] Click upload button
- [ ] Select file(s)
- [ ] Progress shown during upload
- [ ] Success message on completion
- [ ] Document appears in list
- [ ] AI extraction triggered (for CIMs)

### 4.5 AI Chat
- [ ] Chat panel visible
- [ ] Send a message
- [ ] AI response received
- [ ] Response uses document context (RAG)
- [ ] Chat history persisted
- [ ] Attach file from chat works
- [ ] Clear chat works

### 4.6 Stage Transitions
- [ ] Click on stage in pipeline
- [ ] Confirmation modal appears
- [ ] Stage changes on confirm
- [ ] Activity logged

---

## 5. Memo Builder

### 5.1 Page Load
- [ ] Memo Builder loads without errors
- [ ] Sections panel visible
- [ ] Editor panel visible
- [ ] AI chat panel visible

### 5.2 Sections
- [ ] Default sections created
- [ ] Click section → content loads
- [ ] Reorder sections (drag & drop)
- [ ] Add new section
- [ ] Delete section

### 5.3 Editor
- [ ] Edit text content
- [ ] Formatting tools work
- [ ] Auto-save indicator
- [ ] Changes persist on refresh

### 5.4 AI Generation
- [ ] Click "Generate" on a section
- [ ] Loading indicator shown
- [ ] AI content generated
- [ ] Content can be edited after

### 5.5 AI Chat
- [ ] Send question about memo
- [ ] AI responds with context
- [ ] Chat history visible

### 5.6 Export
- [ ] Export to PDF works
- [ ] Export to Word works
- [ ] Formatting preserved

---

## 6. VDR (Virtual Data Room)

### 6.1 Data Room List
- [ ] VDR page loads
- [ ] All data rooms listed
- [ ] Create new data room works

### 6.2 Folder Navigation
- [ ] Default folders created for new deals
- [ ] Click folder → contents shown
- [ ] Breadcrumb navigation works
- [ ] Back button works

### 6.3 File Operations
- [ ] Upload file to folder
- [ ] Download file
- [ ] Preview file
- [ ] Move file between folders
- [ ] Delete file

### 6.4 Folder Operations
- [ ] Create new folder
- [ ] Rename folder
- [ ] Delete folder (if empty)

### 6.5 AI Insights
- [ ] Folder insights displayed
- [ ] Completion percentage shown
- [ ] Red flags highlighted
- [ ] Missing documents listed

---

## 7. AI Features

### 7.1 Deal Ingestion
- [ ] Upload CIM/Teaser document
- [ ] Extraction modal appears
- [ ] Fields extracted correctly
- [ ] Confidence scores shown
- [ ] Manual review for low confidence
- [ ] Create deal from extraction

### 7.2 AI Analysis Caching
- [ ] First AI query → response generated
- [ ] Second same query → cached response (faster)
- [ ] Cache expires after 24 hours
- [ ] Cache invalidated on document upload

### 7.3 RAG (Document Search)
- [ ] Ask question about uploaded document
- [ ] AI references document content
- [ ] Relevant sections cited

---

## 8. Notifications

### 8.1 Notification Center
- [ ] Bell icon in header
- [ ] Click → dropdown opens
- [ ] Notifications listed
- [ ] Mark as read works
- [ ] Clear all works

### 8.2 Real-time Updates
- [ ] Notification appears on new activity
- [ ] Badge count updates

---

## 9. Global Search (Cmd+K)

- [ ] Press Cmd+K (or Ctrl+K)
- [ ] Search modal opens
- [ ] Search deals
- [ ] Search companies
- [ ] Search documents
- [ ] Click result → navigates correctly
- [ ] Recent searches shown

---

## 10. Error Handling

- [ ] 404 page shows for invalid routes
- [ ] API errors show user-friendly messages
- [ ] Network offline → appropriate message
- [ ] Session expired → redirect to login

---

## 11. Performance

- [ ] Page load under 3 seconds
- [ ] No console errors
- [ ] No memory leaks (long sessions)
- [ ] Images/assets load correctly

---

## 12. Security

- [ ] Protected pages require authentication
- [ ] JWT token stored securely
- [ ] XSS: Script tags in inputs don't execute
- [ ] No sensitive data in console logs
- [ ] API calls include auth headers

---

## 13. Responsive Design

### Desktop (1200px+)
- [ ] Full sidebar visible
- [ ] All content fits

### Tablet (768px-1199px)
- [ ] Sidebar collapsible
- [ ] Cards stack appropriately

### Mobile (< 768px)
- [ ] Hamburger menu works
- [ ] Content readable
- [ ] Buttons tappable (44px min)
- [ ] Forms usable

---

## Sign-Off

| Browser | Tester | Date | Status |
|---------|--------|------|--------|
| Chrome | | | |
| Firefox | | | |
| Safari | | | |
| Mobile Chrome | | | |
| Mobile Safari | | | |

**Overall Status:** [ ] Pass / [ ] Fail

**Notes:**

---

*Last Updated: February 5, 2026*
