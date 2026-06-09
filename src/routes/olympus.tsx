import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/olympus')({
  component: () => <Navigate to="/home" />,
});
