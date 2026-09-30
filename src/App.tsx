import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Tasks } from './pages/Tasks';
import { Reports } from './pages/Reports';
import { ActivityPage } from './pages/ActivityPage';
import { Settings } from './pages/Settings';
import { TeamDrop } from './pages/TeamDrop';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />

            {/* Admin and Boss Routes */}
            <Route
              path="employees"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'BOSS']}>
                  <Employees />
                </ProtectedRoute>
              }
            />
            <Route
              path="tasks"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'BOSS']}>
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'BOSS']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="activity"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'BOSS']}>
                  <ActivityPage />
                </ProtectedRoute>
              }
            />

            {/* Common Settings & Profile */}
            <Route path="drop" element={<TeamDrop />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Settings />} />

            {/* Employee Routes */}
            <Route path="my-tasks" element={<Tasks />} />
            <Route path="my-reports" element={<Reports />} />
            <Route path="my-activity" element={<ActivityPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
