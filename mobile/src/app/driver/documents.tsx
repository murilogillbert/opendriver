import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { DocumentPhotoField } from '@/components/ImagePickerField';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { AppText, Card } from '@/components/ui/primitives';

/** Fotos para a análise (RF13). Vão criptografadas; só a equipe de análise vê. */
export default function DriverDocuments() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });

  const upload = (kind: 'cnh' | 'selfie') => async (file: Parameters<typeof api.driver.uploadDocument>[1]) => {
    queryClient.setQueryData(qk.driverProfile, await api.driver.uploadDocument(kind, file));
  };

  return (
    <QueryView query={q}>
      {(p) => (
        <Screen>
          <AppText variant="small">As fotos são guardadas criptografadas e só a equipe de análise da OpenDriver tem acesso.</AppText>
          <Card>
            <DocumentPhotoField label="Foto da CNH" hint="CNH aberta, inteira, sem reflexo." done={p.checklist.cnhPhoto} aspect={[4, 3]} onUpload={upload('cnh')} />
          </Card>
          <Card>
            <DocumentPhotoField label="Selfie" hint="Rosto visível, sem óculos escuros ou boné." done={p.checklist.selfie} aspect={[1, 1]} camera="front" onUpload={upload('selfie')} />
          </Card>
        </Screen>
      )}
    </QueryView>
  );
}
