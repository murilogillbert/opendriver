import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { status, mode, isDriver } = useAuth();
  if (status === 'loading') return null;
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  return <Redirect href={mode === 'driver' && isDriver ? '/drive' : '/passenger'} />;
}
