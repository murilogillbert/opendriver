import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Icon, Row } from '@/components/ui/primitives';
import { maskCardNumber, maskCep, maskExpiry, onlyDigits } from '@/lib/masks';
import { alertError } from '@/lib/recovery';
import { colors } from '@/theme/tokens';

function luhn(n: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = Number(n[i]);
    if (dbl) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
    dbl = !dbl;
  }
  return n.length >= 13 && sum % 10 === 0;
}

function expiryOk(v: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 && new Date(2000 + Number(m[2]), month, 1).getTime() > Date.now();
}

/**
 * Cartão salvo via Asaas: o número vai uma única vez ao gateway e só o token
 * fica guardado (criptografado). Novo cartão vira o padrão.
 */
export default function AddCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cep, setCep] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    number: !luhn(onlyDigits(number)) ? 'Número do cartão inválido.' : undefined,
    holder: holder.trim().length < 3 ? 'Nome como está no cartão.' : undefined,
    expiry: !expiryOk(expiry) ? 'Validade inválida (MM/AA).' : undefined,
    cvv: !/^\d{3,4}$/.test(cvv) ? 'Código inválido.' : undefined,
    cep: onlyDigits(cep).length !== 8 ? 'CEP inválido.' : undefined,
    addressNumber: !addressNumber.trim() ? 'Informe o número.' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (e?: string) => (touched ? e : undefined);

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    try {
      await api.payments.addCard({ number: onlyDigits(number), holder: holder.trim(), expiry, cvv, postalCode: onlyDigits(cep), addressNumber: addressNumber.trim() });
      await queryClient.invalidateQueries({ queryKey: qk.payments });
      toast.success('Cartão salvo e definido como padrão.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível salvar o cartão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Salvar cartão" size="lg" loading={saving} onPress={save} />}>
      <Row>
        <Icon name="lock-closed" size={16} color={colors.success} />
        <AppText variant="small" style={{ flex: 1 }}>
          Os dados vão direto para o processador de pagamentos. Não guardamos o número nem o código de segurança.
        </AppText>
      </Row>
      <TextField label="Número do cartão" value={number} onChangeText={(v) => setNumber(maskCardNumber(v))} keyboardType="number-pad" autoComplete="cc-number" textContentType="creditCardNumber" error={show(errors.number)} />
      <TextField label="Nome impresso no cartão" value={holder} onChangeText={setHolder} autoCapitalize="characters" autoComplete="cc-name" maxLength={26} error={show(errors.holder)} />
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Validade" placeholder="MM/AA" value={expiry} onChangeText={(v) => setExpiry(maskExpiry(v))} keyboardType="number-pad" autoComplete="cc-exp" error={show(errors.expiry)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="CVV" value={cvv} onChangeText={(v) => setCvv(onlyDigits(v).slice(0, 4))} keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry error={show(errors.cvv)} />
        </View>
      </Row>
      <AppText variant="label">Endereço de cobrança</AppText>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 2 }}>
          <TextField label="CEP" value={cep} onChangeText={(v) => setCep(maskCep(v))} keyboardType="number-pad" autoComplete="postal-code" error={show(errors.cep)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Número" value={addressNumber} onChangeText={setAddressNumber} maxLength={10} error={show(errors.addressNumber)} />
        </View>
      </Row>
    </Screen>
  );
}
