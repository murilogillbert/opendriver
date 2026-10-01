import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { toUploadableJpeg } from '@/components/ImagePickerField';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Icon } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError } from '@/lib/recovery';
import { colors, radius, spacing } from '@/theme/tokens';

const MAX_PHOTOS = 5;

/** Central de reclamações com foto (plano §3) — categoria, descrição e até 5 fotos. */
export default function Complaint() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const { mode } = useAuth();
  const toast = useToast();
  const categories = useQuery({ queryKey: ['complaints', 'categories'], queryFn: () => api.complaints.categories() });
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const valid = !!category && description.trim().length >= 10;

  const addPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (res.canceled) return;
    const uris = await Promise.all(res.assets.map((a) => toUploadableJpeg(a.uri, a.width, a.height)));
    setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (uri: string) => setPhotos((prev) => prev.filter((p) => p !== uri));

  const send = async () => {
    if (!category) return;
    setSending(true);
    try {
      const { incidentId } = await api.complaints.open({
        rideId: rideId || undefined,
        category,
        description: description.trim(),
        role: rideId ? undefined : mode === 'driver' ? 'driver' : 'passenger',
      });
      if (photos.length) {
        await api.complaints
          .uploadAttachments(
            incidentId,
            photos.map((uri) => ({ uri, name: 'foto.jpg', type: 'image/jpeg' })),
          )
          .catch(() => {
            // A reclamação já foi registrada mesmo se o envio das fotos falhar — não bloqueia o passageiro/motorista.
            toast.info('Reclamação enviada, mas não conseguimos subir as fotos. Tente anexar de novo depois.');
          });
      }
      toast.success('Recebemos sua reclamação. Nossa equipe vai analisar.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível enviar a reclamação');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen footer={<Button title="Enviar reclamação" size="lg" disabled={!valid} loading={sending} onPress={send} />}>
      <AppText>Conte o que aconteceu. Você pode anexar fotos como prova — só a equipe da OpenDriver vê.</AppText>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Categoria</AppText>
        <View style={styles.chips}>
          {(categories.data ?? []).map((c) => (
            <Chip key={c.code} label={c.label} active={category === c.code} onPress={() => setCategory(c.code)} />
          ))}
        </View>
      </View>

      <TextField
        label="O que aconteceu?"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
        hint={description.trim().length >= 10 ? `${description.trim().length}/1000` : 'Escreva pelo menos 10 caracteres.'}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Fotos (opcional)</AppText>
        <View style={styles.chips}>
          {photos.map((uri) => (
            <View key={uri} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remover foto"
                hitSlop={6}
                onPress={() => removePhoto(uri)}
                style={styles.remove}
              >
                <Icon name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <Button title="Adicionar" icon="camera-outline" variant="outline" size="sm" onPress={() => void addPhotos()} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
