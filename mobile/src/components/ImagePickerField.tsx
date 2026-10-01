import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { errorMessage } from '@/api/errors';
import type { UploadFile } from '@/api/types';
import { colors, radius, spacing } from '@/theme/tokens';
import { useToast } from './Toast';
import { Button } from './ui/Button';
import { AppText, Icon, Row } from './ui/primitives';

const MAX_SIDE = 1600;
const MAX_BYTES = 5 * 1024 * 1024; // STORAGE_MAX_IMAGE_BYTES padrão do backend

/**
 * O backend só aceita JPEG/PNG/WEBP (checa magic bytes) de até 5 MB. Fotos do
 * iPhone vêm em HEIC por padrão — toda imagem é redimensionada e convertida
 * para JPEG antes do upload.
 */
export async function toUploadableJpeg(uri: string, width?: number, height?: number) {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const ref = await ctx.renderAsync();
  let result = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  // Garantia extra de tamanho: recomprime mais se ainda passar do limite.
  const size = await fetch(result.uri)
    .then((r) => r.blob())
    .then((b) => b.size)
    .catch(() => 0);
  if (size > MAX_BYTES) result = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.5 });
  return result.uri;
}

async function pick(source: 'camera' | 'library', aspect: [number, number], camera: 'front' | 'back') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Câmera sem permissão', 'Libere o acesso à câmera nos Ajustes para tirar a foto.', [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
      ]);
      return null;
    }
    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.9,
      cameraType: camera === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
  }
  // Galeria: no iOS 14+/Android 13+ o seletor do sistema não exige permissão.
  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.9 });
}

/**
 * Foto de documento (CNH, selfie, CRLV). O arquivo vai direto para o
 * armazenamento privado criptografado — o app nunca baixa de volta; mostra só
 * a prévia local e o status "Enviado".
 */
export function DocumentPhotoField({
  label,
  hint,
  done,
  aspect = [4, 3],
  camera = 'back',
  onUpload,
}: {
  label: string;
  hint?: string;
  done: boolean;
  aspect?: [number, number];
  camera?: 'front' | 'back';
  onUpload: (file: UploadFile) => Promise<void>;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const run = async (source: 'camera' | 'library') => {
    try {
      const res = await pick(source, aspect, camera);
      if (!res || res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      const uri = await toUploadableJpeg(asset.uri, asset.width, asset.height);
      await onUpload({ uri, name: 'documento.jpg', type: 'image/jpeg' });
      setPreview(uri);
      toast.success(`${label}: enviado.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível enviar a foto. Tente novamente.'));
    } finally {
      setUploading(false);
    }
  };

  const choose = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Tirar foto', 'Escolher da galeria', 'Cancelar'], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) void run('camera');
          if (i === 1) void run('library');
        },
      );
    } else {
      Alert.alert(label, undefined, [
        { text: 'Tirar foto', onPress: () => void run('camera') },
        { text: 'Galeria', onPress: () => void run('library') },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  };

  return (
    <Row gap={spacing.md} style={styles.row}>
      {preview ? (
        <Image source={{ uri: preview }} style={styles.preview} contentFit="cover" accessibilityLabel={`${label} enviada`} />
      ) : (
        <View style={[styles.preview, styles.placeholder]}>
          <Icon name={done ? 'checkmark-circle' : 'camera-outline'} size={28} color={done ? colors.success : colors.textSoft} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? <AppText variant="small">{hint}</AppText> : null}
        <Button
          title={done ? 'Enviar outra' : 'Enviar foto'}
          icon="camera-outline"
          variant={done ? 'outline' : 'secondary'}
          size="sm"
          loading={uploading}
          onPress={choose}
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        />
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start' },
  preview: { width: 88, height: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  placeholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
