import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PreviewThemeProvider } from "@/hooks/usePreviewTheme";
import { CollegeProvider } from "@/contexts/CollegeContext";
import PreviewModeBanner from "@/components/PreviewModeBanner";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleRoute from "@/components/RoleRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import ImportUsers from "./pages/admin/ImportUsers.tsx";
import Rules from "./pages/admin/Rules.tsx";
import Keywords from "./pages/admin/Keywords.tsx";
import Cases from "./pages/admin/Cases.tsx";
import Competitions from "./pages/admin/Competitions.tsx";
import CertificatesCatalog from "./pages/admin/Certificates.tsx";

import AdminDashboard from "./pages/admin/Dashboard.tsx";
import ReviewHub from "./pages/admin/ReviewHub.tsx";
import Credits from "./pages/admin/Credits.tsx";
import UsersManage from "./pages/admin/UsersManage.tsx";
import AuditLogs from "./pages/admin/AuditLogs.tsx";
import AiModels from "./pages/admin/AiModels.tsx";
import AigcAdmin from "./pages/admin/AigcAdmin.tsx";
import Reviews from "./pages/Reviews.tsx";
import SubmissionRecords from "./pages/SubmissionRecords.tsx";
import Apply from "./pages/student/Apply.tsx";
import MyApplications from "./pages/student/MyApplications.tsx";
import MyProfile from "./pages/student/MyProfile.tsx";
import ApplicationDetail from "./pages/ApplicationDetail.tsx";
import Students from "./pages/teacher/Students.tsx";
import StudentDetail from "./pages/teacher/StudentDetail.tsx";
import TeacherDashboard from "./pages/teacher/Dashboard.tsx";
import TeacherCredits from "./pages/teacher/Credits.tsx";
import TeacherClasses from "./pages/teacher/Classes.tsx";
import VerifyCertificate from "./pages/VerifyCertificate.tsx";
import NotFound from "./pages/NotFound.tsx";
import RealtimeDiagnostics from "./pages/RealtimeDiagnostics.tsx";
import PurgeAndBootstrap from "./pages/admin/PurgeAndBootstrap.tsx";
import Branding from "./pages/admin/Branding.tsx";
import SubmissionWindows from "./pages/admin/SubmissionWindows.tsx";
import WindowReport from "./pages/admin/WindowReport.tsx";
import SuperColleges from "./pages/super/Colleges.tsx";
import SuperAdmins from "./pages/super/Admins.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PreviewThemeProvider>
            <CollegeProvider>
              <PreviewModeBanner />
              <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/verify/:certNo" element={<VerifyCertificate />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/admin" element={<RoleRoute role="admin"><AdminDashboard /></RoleRoute>} />
            <Route path="/admin/dashboard" element={<RoleRoute role="admin"><AdminDashboard /></RoleRoute>} />
            <Route path="/admin/review" element={<RoleRoute role="admin"><ReviewHub /></RoleRoute>} />
            <Route path="/admin/credits" element={<RoleRoute role="admin"><Credits /></RoleRoute>} />
            <Route path="/admin/users/:role" element={<RoleRoute role="admin"><UsersManage /></RoleRoute>} />
            <Route path="/admin/import" element={<RoleRoute role="admin"><ImportUsers /></RoleRoute>} />
            <Route path="/admin/rules" element={<RoleRoute role="admin"><Rules /></RoleRoute>} />
            <Route path="/admin/keywords" element={<RoleRoute role="admin"><Keywords /></RoleRoute>} />
            <Route path="/admin/cases" element={<RoleRoute role="admin"><Cases /></RoleRoute>} />
            <Route path="/admin/competitions" element={<RoleRoute role="admin"><Competitions /></RoleRoute>} />
            <Route path="/admin/certificates" element={<RoleRoute role="admin"><CertificatesCatalog /></RoleRoute>} />

            <Route path="/admin/audit-logs" element={<RoleRoute role="admin"><AuditLogs /></RoleRoute>} />
            <Route path="/admin/ai-models" element={<RoleRoute role="super_admin"><AiModels /></RoleRoute>} />
            <Route path="/admin/aigc" element={<RoleRoute role="super_admin"><AigcAdmin /></RoleRoute>} />
            <Route path="/admin/reset" element={<RoleRoute role="admin"><PurgeAndBootstrap /></RoleRoute>} />
            <Route path="/admin/branding" element={<RoleRoute role="admin"><Branding /></RoleRoute>} />
            <Route path="/admin/submission-windows" element={<RoleRoute role={["admin", "super_admin"]}><SubmissionWindows /></RoleRoute>} />
            <Route path="/admin/window-report/:windowId" element={<RoleRoute role={["admin", "super_admin"]}><WindowReport /></RoleRoute>} />
            <Route path="/super/colleges" element={<RoleRoute role="super_admin"><SuperColleges /></RoleRoute>} />
            <Route path="/super/admins" element={<RoleRoute role="super_admin"><SuperAdmins /></RoleRoute>} />
            <Route path="/apply" element={<RoleRoute role="student"><Apply /></RoleRoute>} />
            <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
            <Route path="/submissions" element={<RoleRoute role={["teacher", "admin"]}><SubmissionRecords /></RoleRoute>} />
            <Route path="/my-applications" element={<RoleRoute role="student"><MyApplications /></RoleRoute>} />
            <Route path="/profile" element={<RoleRoute role="student"><MyProfile /></RoleRoute>} />
            <Route path="/applications/:id" element={<ProtectedRoute><ApplicationDetail /></ProtectedRoute>} />
            <Route path="/teacher/students" element={<RoleRoute role={["teacher", "admin"]}><Students /></RoleRoute>} />
            <Route path="/teacher/students/:id" element={<RoleRoute role={["teacher", "admin"]}><StudentDetail /></RoleRoute>} />
            <Route path="/teacher/dashboard" element={<RoleRoute role={["teacher", "admin"]}><TeacherDashboard /></RoleRoute>} />
            <Route path="/teacher/credits" element={<RoleRoute role={["teacher", "admin"]}><TeacherCredits /></RoleRoute>} />
            <Route path="/teacher/classes" element={<RoleRoute role={["teacher", "admin"]}><TeacherClasses /></RoleRoute>} />
            <Route path="/diagnostics/realtime" element={<ProtectedRoute><RealtimeDiagnostics /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
              </Routes>
            </CollegeProvider>
          </PreviewThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
