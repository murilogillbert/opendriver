import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Category } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Segmented } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { maskPlate, onlyDigits } from '@/lib/masks';
import { spacing } from '@/theme/tokens';
import { alertError } from '@/lib/recovery';

const PLATE = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

export default function NewVehicle() {
  const { refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState<Category>('Economy');
  const [renavam, setRenavam] = useState('');
  const [uf, setUf] = useState('');
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false);
  const [saving, setSaving] = useState(false);
  const thisYear = new Date().getFullYear();
  const y = Number(year);
  const yearError = year.length === 4 && (y < thisYear - 15 || y > thisYear + 1) ? `Aceitamos veículos de ${thisYear - 15} em diante.` : undefined;
  const renavamError = renavam.length > 0 && renavam.length !== 11 ? 'RENAVAM tem 11 números.' : undefined;
  const valid =
    PLATE.test(plate) &&
    brand.trim().length >= 2 &&
    model.trim().length >= 1 &&
    color.trim().length >= 3 &&
    year.length === 4 &&
    !yearError &&
    !renavamError &&
    (renavam.length === 0 || uf.length === 2);

  const save = async () => {
    setSaving(true);
    try {
      await api.driver.addVehicle({
        plate: plate.replace('-', ''),
        brand: brand.trim(),
        model: model.trim(),
        color: color.trim(),
        year: y,
        category,
        renavam: renavam || undefined,
        uf: uf || undefined,
        wheelchairAccessible,
      });
      await queryClient.invalidateQueries({ queryKey: qk.driverProfile });
      await refreshMe();
      router.back(); // volta para Veículos, onde envia o CRLV
    } catch (err) {
      alertError(err, 'Não foi possível cadastrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Salvar veículo" size="lg" disabled={!valid} loading={saving} onPress={save} />}>
      <TextField label="Placa" value={plate} onChangeText={(v) => setPlate(maskPlate(v))} autoCapitalize="characters" autoCorrect={false} placeholder="ABC1D23" />
      <TextField label="Marca" value={brand} onChangeText={setBrand} placeholder="Ex.: Chevrolet" />
      <TextField label="Modelo" value={model} onChangeText={setModel} placeholder="Ex.: Onix" />
      <TextField label="Cor" value={color} onChangeText={setColor} placeholder="Ex.: Prata" />
      <TextField label="Ano de fabricação" value={year} onChangeText={(v) => setYear(onlyDigits(v).slice(0, 4))} keyboardType="number-pad" error={yearError} />
      <AppText variant="label">Categoria</AppText>
      <Segmented
        accessibilityLabel="Categoria do veículo"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'Economy', label: 'Econômico' },
          { value: 'Comfort', label: 'Conforto' },
        ]}
      />
      <AppText variant="label">RENAVAM (opcional)</AppText>
      <AppText variant="small">Informando o RENAVAM e a UF, tentamos validar o CRLV automaticamente — hoje isso funciona pra MT e MS; outros estados seguem para revisão manual.</AppText>
      <TextField
        label="RENAVAM"
        value={renavam}
        onChangeText={(v) => setRenavam(onlyDigits(v).slice(0, 11))}
        keyboardType="number-pad"
        placeholder="11 números"
        error={renavamError}
      />
      {renavam.length > 0 ? (
        <TextField
          label="UF do veículo"
          value={uf}
          onChangeText={(v) => setUf(v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
          autoCapitalize="characters"
          placeholder="MT"
        />
      ) : null}
      <Checkbox
        label="Meu carro é adaptado para cadeira de rodas"
        checked={wheelchairAccessible}
        onChange={setWheelchairAccessible}
      />
      <AppText variant="small" style={{ marginTop: spacing.sm }}>
        Depois de salvar, envie a foto do CRLV na lista de veículos.
      </AppText>
    </Screen>
  );
}
