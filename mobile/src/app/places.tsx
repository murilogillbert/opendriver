import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, QueryView } from '@/components/ui/States';
import { AppText, Card } from '@/components/ui/primitives';
import { alertError, confirm } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

/** Locais salvos (Casa, Trabalho…): viram atalhos de 1 toque na tela Viagem. */
export default function Places() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.places, queryFn: () => api.me.places() });

  const remove = async (id: string, label: string) => {
    if (!(await confirm('Remover local?', `"${label}" deixará de aparecer nos atalhos.`, 'Remover'))) return;
    try {
      await api.me.removePlace(id);
      await queryClient.invalidateQueries({ queryKey: qk.places });
    } catch (err) {
      alertError(err);
    }
  };

  const add = () => router.push({ pathname: '/search', params: { field: 'save' } });

  return (
    <QueryView query={q}>
      {(data) => (
        <Screen footer={<Button title="Adicionar local" icon="add" onPress={add} />}>
          {data.saved.length ? (
            <Card style={{ padding: spacing.xs }}>
              {data.saved.map((p) => (
                <ListRow
                  key={p.id}
                  icon="bookmark-outline"
                  title={p.label}
                  subtitle={p.address}
                  chevron={false}
                  right={<Button title="Remover" variant="ghost" size="sm" onPress={() => void remove(p.id, p.label)} />}
                />
              ))}
            </Card>
          ) : (
            <EmptyState icon="bookmark-outline" title="Nenhum local salvo" message="Salve Casa e Trabalho para pedir corrida com 2 toques." />
          )}
          <AppText variant="small">Seus destinos recentes aparecem sozinhos na tela Viagem.</AppText>
        </Screen>
      )}
    </QueryView>
  );
}
