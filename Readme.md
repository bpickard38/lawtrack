# LawTrack - Time Tracking for Lawyers

# How to start servers
   Start back end
   cd C:\Users\bpick\lawtrack-fresh\backend
   .\venv\Scripts\Activate.ps1  # Activate virtual environment
   uvicorn main:app --reload

   Front end
   cd C:\Users\bpick\lawtrack-fresh\frontend
   npm start  # or npm run dev

   Agent
   cd C:\Users\bpick\lawtrack-fresh\agent
   .\venv\Scripts\activate
   python main.py



## 🎯 Features

- **Manual Activity Entry**: Log documents, emails, and phone calls with start/end times
- **Timeline View**: See all your activities in chronological order
- **Case Assignment**: Assign activities to specific cases
- **Time Reports**: View total time spent per case, broken down by activity type
- **Clean Interface**: Simple, professional design

---

## 📋 Prerequisites

- Python 3.8+ installed
- Node.js 18+ and npm installed
- PostgreSQL database running

---

## 🚀 Quick Start

### Step 1: Set Up PostgreSQL Database

Create a new database in PostgreSQL:

```sql
CREATE DATABASE lawtrack;
```

### Step 2: Backend Setup

1. **Navigate to backend folder:**
   ```powershell
   cd C:\Users\bpick\lawtrack-fresh\backend
   ```

2. **Create virtual environment:**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Create .env file:**
   Copy `.env.example` to `.env` and update with your database credentials:
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/lawtrack
   CORS_ORIGINS=http://localhost:5173
   ```

5. **Initialize database:**
   ```powershell
   python init_db.py
   ```

   This will:
   - Create all necessary tables
   - Add a sample attorney ("John Doe")
   - Create 3 sample cases

6. **Start the backend server:**
   ```powershell
   uvicorn main:app --reload
   ```

   The API will be running at `http://localhost:8000`

### Step 3: Frontend Setup

1. **Open a new terminal and navigate to frontend:**
   ```powershell
   cd C:\Users\bpick\lawtrack-fresh\frontend
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Start the development server:**
   ```powershell
   npm run dev
   ```

   The app will be running at `http://localhost:5173`

### Step 4: Use the App!

1. Open `http://localhost:5173` in your browser
2. Click "+ Add Activity"
3. Fill in the form:
   - Select activity type (Document, Email, or Call)
   - Enter start and end times
   - Add type-specific details
4. Click "Add Activity"
5. Assign the activity to a case using the dropdown
6. View case reports to see time totals

---

## 📖 How to Use

### Adding an Activity

#### Document Activity
1. Click "+ Add Activity"
2. Select "📄 Document"
3. Enter start and end times
4. Enter document name (e.g., "Motion_to_Dismiss.pdf")
5. Add description (optional)
6. Click "Add Activity"

#### Email Activity
1. Click "+ Add Activity"
2. Select "📧 Email"
3. Enter start and end times
4. Enter:
   - From email address
   - To email address
   - Subject line
5. Click "Add Activity"

#### Phone Call Activity
1. Click "+ Add Activity"
2. Select "📞 Phone Call"
3. Enter start and end times
4. Enter:
   - Contact name
   - Phone number (optional)
5. Click "Add Activity"

### Assigning to a Case

1. Find the activity in the timeline
2. Click "Assign to Case"
3. Select the case from the dropdown
4. Activity will now show a green checkmark with the case name

### Viewing Case Reports

1. Click "📊 Case Reports" tab
2. See total hours per case
3. View breakdown by activity type (documents, emails, calls)
4. See percentage distribution

---

## 🗂️ Project Structure

```
lawtrack-fresh/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── models.py            # Database models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # Database configuration
│   ├── init_db.py           # Database initialization
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Configuration (create this)
│
└── frontend/
    ├── src/
    │   ├── App.tsx          # Main application component
    │   ├── types.ts         # TypeScript types
    │   ├── api.ts           # API helper functions
    │   ├── styles.css       # Styles
    │   ├── main.tsx         # Entry point
    │   └── components/
    │       ├── AddActivityForm.tsx      # Activity entry form
    │       ├── ActivityTimeline.tsx     # Timeline display
    │       └── CaseReports.tsx          # Case reports
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── index.html
```

---

## 🔌 API Endpoints

### Attorneys
- `GET /api/attorneys` - List all attorneys
- `POST /api/attorneys` - Create attorney
- `GET /api/attorneys/{id}` - Get attorney details

### Cases
- `GET /api/cases` - List all cases
- `POST /api/cases` - Create case
- `GET /api/cases/{id}` - Get case details
- `GET /api/cases/{id}/time-summary` - Get case time summary

### Activities
- `GET /api/activities` - List activities (with filters)
- `POST /api/activities` - Create activity
- `PATCH /api/activities/{id}` - Update activity (assign to case)
- `DELETE /api/activities/{id}` - Delete activity

---

## 💡 Tips

### Adding More Attorneys
Use the API to add more attorneys:

```bash
curl -X POST http://localhost:8000/api/attorneys \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Smith", "email": "jane@lawfirm.com", "billable_rate": 400}'
```

### Adding More Cases
Use the API or modify `init_db.py` to add more cases.

### Filtering Activities
- Click "All Activities" to see everything
- Click "Unassigned" to see activities that need case assignment

---

## 🐛 Troubleshooting

### Backend won't start
- Check PostgreSQL is running
- Verify database credentials in `.env`
- Make sure port 8000 is not in use

### Frontend shows errors
- Ensure backend is running first
- Check console for CORS errors
- Verify API_BASE URL in `api.ts`

### Database errors
- Run `python init_db.py` again
- Check PostgreSQL connection
- Verify database exists

---

## 🎨 Customization

### Change Port
**Backend:** Edit `uvicorn` command
```powershell
uvicorn main:app --reload --port 8080
```

**Frontend:** Edit `vite.config.ts`
```typescript
server: { port: 3000 }
```

### Add New Activity Types
1. Update `ActivityType` enum in `models.py` and `schemas.py`
2. Update frontend `types.ts`
3. Add icons in `ActivityTimeline.tsx`

---

## 🚀 Next Steps

This is an MVP with manual entry. Future enhancements could include:

- Automatic document tracking
- Email integration (Outlook/Gmail)
- Phone call logging
- Export to PDF/Excel
- Billing calculations
- Multi-attorney firms
- Client portal

---

## 📞 Support

For issues or questions, check:
- Backend logs in the terminal running `uvicorn`
- Frontend console (F12 in browser)
- Network tab for API errors

---

## ✅ Success Checklist

- [ ] PostgreSQL database created
- [ ] Backend dependencies installed
- [ ] `.env` file configured
- [ ] Database initialized with `python init_db.py`
- [ ] Backend server running on port 8000
- [ ] Frontend dependencies installed
- [ ] Frontend running on port 5173
- [ ] Can add an activity
- [ ] Can assign activity to case
- [ ] Can view case reports

---

**Happy time tracking!** ⚖️