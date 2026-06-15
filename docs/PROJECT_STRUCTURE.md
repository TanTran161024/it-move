# Project Structure

```text
Movie-website-main-main/
  frontend/                 React + Vite user interface
  backend/                  Express API + MySQL database scripts
  docs/                     Project notes and setup documents
  package.json              Root commands
  README.md                 Setup and run guide
```

## Frontend

```text
frontend/src/
  components/
    admin/                  Admin dashboard components
      AdminFeedbackManager.jsx
      CategoryManager.jsx
      EpisodeManager.jsx
      MovieForm.jsx
      MovieTable.jsx
      Sidebar.jsx
    auth/                   Login/register/forgot password components
      ForgotPasswordDialog.jsx
      GoogleLoginButton.jsx
      LoginDialog.jsx
      RegisterDialog.jsx
    filter/                 Movie filter controls
      FilterBox.jsx
      FilterBox.css
    layout/                 Shared layout components
      Banner.jsx
      Footer.jsx
      Header.jsx
      ScrollToTop.jsx
    movie/                  Movie display components and data
      MovieList.jsx
      MovieSlider.jsx
      movieData.js
    player/                 Video player components
      VideoPlayer/
    user/                   User profile/library components
      ProfileSidebar.jsx
  pages/                    Route pages
  assets/                   Static frontend assets
```

## Backend

```text
backend/
  index.js                  Express server entry
  routes.js                 API routes
  movie_website.sql         Full database import for fresh setup
  migrations/               Incremental database updates
  scripts/
    import-kkphim.js        Import movies from KKPhim/PhimAPI
```

## Common Commands

Run the frontend from the project root:

```powershell
npm run frontend
```

Run the backend from the project root:

```powershell
npm run backend
```

Build the frontend:

```powershell
npm run build
```

Import movies from KKPhim:

```powershell
npm run import:kkphim
```

## Database Files

Use `backend/movie_website.sql` for a fresh database import.

Use files in `backend/migrations/` when updating an existing database.
