import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/olympus/$')({
  component: () => <Navigate to="/home" />,
});
