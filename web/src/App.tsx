import { Route, Routes } from 'react-router-dom';
import { NavBar } from '@/components/nav-bar';
import { Landing } from '@/pages/landing';
import { Portal } from '@/pages/portal';
import { Admin } from '@/pages/admin';

function App() {
  return (
    <div className="min-h-svh bg-muted/30">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/portal" element={<Portal />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/:caseId" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
