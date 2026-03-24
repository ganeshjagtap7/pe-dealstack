# Org Isolation Test Checklist

**What are we testing?** Our app lets different firms (like "Alpha Capital" and "Beta Partners") use the same platform. We need to make sure one firm can NEVER see another firm's data — no deals, no contacts, no documents, no chat messages. Nothing.

**Think of it like this:** Two companies share the same office building but have separate locked offices. You should never be able to walk into the other company's office.

**Tester:** _______________
**Date:** _______________

---

## Part A: Run the Automated Check (5 min)

Before testing anything by hand, run our automated checker. It logs in as both firms and tries 34 different ways to sneak into the other firm's data. Every single one should be blocked.

### Before you run

1. Make sure the app server is running (ask a dev if unsure)
2. You need login credentials for **two accounts in different firms**
3. Both accounts must have at least 1 deal and 1 contact already created
4. If the second firm account doesn't exist yet — go to the app's signup page, create a new account with a **different firm name**, then create a deal and a contact in it
5. Open the file `apps/api/.env.test` and fill in both logins:

```
TEST_ORG_A_EMAIL="first-firm@email.com"
TEST_ORG_A_PASSWORD="their-password"
TEST_ORG_B_EMAIL="second-firm@email.com"
TEST_ORG_B_PASSWORD="their-password"
```

### How to run

Open terminal, type:
```
cd apps/api
npm run test:org-isolation
```

### What you should see

All green checkmarks:
```
✓ 34 tests passed
```

If anything shows red/failed — stop here and report it to the dev team.

| Part A Result | |
|---|---|
| All 34 automated checks passed? | YES / NO |
| If NO, which ones failed? | |

---

## Part B: Manual Testing — Use the App Like a Real User (20 min)

Open **two browser windows side by side**. Use incognito/private mode for the second one so the logins don't interfere.

- **Window 1:** Log in as Firm A
- **Window 2:** Log in as Firm B

### First: Create some test data

Do this in **both** windows:

1. Go to Deals page > click "+ New Deal" > name it something obvious like "**Alpha Test Deal**" / "**Beta Test Deal**"
2. Go to Contacts page > click "+ Add Contact" > name it "**Alpha Test Contact**" / "**Beta Test Contact**"
3. Open your test deal > go to Data Room tab > upload any small PDF
4. Open your test deal > go to Chat tab > type "Hello" and send

Write down how many deals and contacts each firm has — you'll need this to check counts.

| | Firm A | Firm B |
|---|---|---|
| Number of deals | ___ | ___ |
| Number of contacts | ___ | ___ |

---

### Test 1: Deals Page

Open the **Deals** page in both windows.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 1 | Each firm sees only their own deals | Count the deals in both windows | Firm A sees only Firm A deals. Firm B sees only Firm B deals. No mixing. | |
| 2 | Can't open the other firm's deal via URL | In Firm A's window, click on a deal. Copy the full URL from the browser address bar. Paste it into Firm B's window. | Firm B should see an error or empty page — NOT Firm A's deal details. | |

---

### Test 2: Data Room (Documents & Folders)

Open your test deal > click on the **Data Room** tab.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 3 | Each firm sees only their own folders | Look at the folder list in both windows | Completely different folders. No overlap. | |
| 4 | Each firm sees only their own files | Click into a folder in both windows | Each firm sees only the PDF they uploaded. Not the other firm's file. | |
| 5 | Can't download the other firm's document | In Firm A, right-click a document > copy the download link. Paste it in Firm B's browser. | Should fail or show "Document not found". Firm B must NOT be able to download Firm A's file. | |
| 6 | Can't see the other firm's folder insights | If available, click "Generate Insights" on a folder in Firm A. Then copy that folder's URL and paste in Firm B. | Firm B sees "Folder not found". | |

---

### Test 3: Deal Chat

Open your test deal > click on the **Chat** tab.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 7 | Each firm sees only their own chat | Look at the chat messages in both windows | Firm A sees "Hello" they sent. Firm B sees "Hello" they sent. No mixing. | |
| 8 | Can't chat on the other firm's deal | Copy Firm A's deal URL. Paste in Firm B's window. Try typing and sending a message. | Should fail. Firm B cannot chat on Firm A's deal. | |
| 9 | AI doesn't leak the other firm's info | In Firm A's chat, ask: "What deals do we have?" | The AI response should ONLY mention Firm A's deals. Zero mention of any Firm B deal names. | |

---

### Test 4: Contacts Page

Open the **Contacts** page in both windows.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 10 | Each firm sees only their own contacts | Count the contacts in both windows | Numbers match what you wrote down earlier. No contacts from the other firm. | |
| 11 | Can't open the other firm's contact via URL | Copy a contact's URL from Firm A. Paste in Firm B's browser. | "Contact not found" or empty page. NOT Firm A's contact info. | |
| 12 | Relationship scores are correct | Look at the colored badges next to contacts (Cold / Warm / Active / Strong) | Scores should reflect only YOUR firm's activity — not inflated by the other firm's data. | |

---

### Test 5: Deal Team

Open your test deal > click on the **Team** tab.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 13 | Can't see the other firm's team | Copy Firm A's deal URL. Open in Firm B. Look for the Team tab. | Firm B cannot see who is on Firm A's deal team. | |

---

### Test 6: AI Features

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 14 | Portfolio AI only knows your deals | On the Dashboard, use Portfolio Chat. Ask "Summarize all deals" or "Show pipeline". | Only YOUR firm's deals appear. Nothing from the other firm. | |
| 15 | Meeting Prep only uses your data | Open a deal > click the menu (three dots) > "Meeting Prep" | The prep brief only references your deal. No data from the other firm. | |

---

### Test 7: Same Firm Users See Everything

**This is the opposite check.** If your firm has 2 user accounts, log in as both. They SHOULD see the same data — nothing hidden within the same firm.

| # | What to check | How | Expected | Pass? |
|---|---|---|---|---|
| 16 | Both users see all deals | Open Deals page on both accounts | Exact same list of deals | |
| 17 | Both users see all documents | Open Data Room on the same deal | Exact same files | |
| 18 | Both users see chat history | Open Chat on the same deal | Exact same messages | |

> If you only have 1 user per firm, skip tests 16-18.

---

## Short on Time? (5 min version)

1. Run `npm run test:org-isolation` — all 34 automated checks pass
2. **Test #1** — Deals page shows only your firm's deals
3. **Test #5** — Can't download another firm's document
4. **Test #8** — Can't chat on another firm's deal
5. **Test #10** — Contacts page shows only your firm's contacts

---

## Results

| Section | Status |
|---------|--------|
| **Part A:** Automated (34 checks) | PASS / FAIL |
| **Part B:** Manual UI (18 checks) | PASS / FAIL |

| Test # | Pass? | Notes |
|--------|-------|-------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |
| 13 | | |
| 14 | | |
| 15 | | |
| 16 | | |
| 17 | | |
| 18 | | |

**Overall:** PASS / FAIL
**Tested by:** _______________
**Date:** _______________
**Notes:** _______________
