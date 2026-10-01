import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, QueryView } from '@/components/ui/States';
import { AppText, Card } from '@/components/ui/primitives';
import { alertError, confirm } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

/** Motoristas favoritos (plano §6) — usados no agendamento e com leve prioridade no despacho. */
export default function Favorites() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.favorites, queryFn: () => api.me.favorites() });

  const remove = async (driverId: string, name: string) => {
    if (!(await confirm('Remover dos favoritos?', `${name} deixará de ter prioridade nas suas corridas.`, 'Remover'))) return;
    try {
      await api.me.removeFavorite(driverId);
      await queryClient.invalidateQueries({ queryKey: qk.favorites });
    } catch (err) {
      alertError(err);
    }
  };

  return (
    <QueryView query={q}>
      {(favorites) => (
        <Screen>
          {favorites.length ? (
            <Card style={{ padding: spacing.xs }}>
              {favorites.map((f) => (
                <ListRow
                  key={f.driverId}
                  icon="star"
                  title={f.name}
                  subtitle={f.rating ? `Nota ${f.rating.toFixed(1)}` : undefined}
                  chevron={false}
                  right={<Button title="Remover" variant="ghost" size="sm" onPress={() => void remove(f.driverId, f.name)} />}
                />
              ))}
            </Card>
          ) : (
            <EmptyState icon="star-outline" title="Nenhum motorista favorito" message="Depois de uma viagem, você pode favoritar o motorista pelo recibo da corrida." />
          )}
          <AppText variant="small">Favoritos têm leve prioridade quando pedem uma corrida com você por perto, e podem ser escolhidos em corridas agendadas.</AppText>
        </Screen>
      )}
    </QueryView>
  );
}
