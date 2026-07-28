import PublicLayout from '@/layouts/PublicLayout';
import CanvasStudioPanel from '../playground/CanvasStudioPanel';
import './index.css';

export default function CanvasPage() {
  return (
    <PublicLayout hideFooter>
      <main className="canvas-page">
        <CanvasStudioPanel />
      </main>
    </PublicLayout>
  );
}
