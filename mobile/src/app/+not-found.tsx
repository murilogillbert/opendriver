import { router } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        icon="compass-outline"
        title="Página não encontrada"
        message="O link que você abriu não existe mais."
        action={<Button title="Voltar ao início" onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
