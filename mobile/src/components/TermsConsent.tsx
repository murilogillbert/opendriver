import * as WebBrowser from 'expo-web-browser';
import { Text } from 'react-native';
import { links } from '@/config/env';
import { colors, font } from '@/theme/tokens';
import { Checkbox } from './ui/Controls';
import { AppText } from './ui/primitives';

export function TermsConsent({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <>
      <Checkbox label="Li e aceito os termos de uso e a política de privacidade" checked={checked} onChange={onChange}>
        <Text style={{ fontSize: font.small, color: colors.text, lineHeight: 19 }} maxFontSizeMultiplier={1.4}>
          Li e aceito os{' '}
          <Text style={{ color: colors.blue, fontWeight: '600' }} onPress={() => WebBrowser.openBrowserAsync(links.terms)}>
            termos de uso
          </Text>{' '}
          e a{' '}
          <Text style={{ color: colors.blue, fontWeight: '600' }} onPress={() => WebBrowser.openBrowserAsync(links.privacyPolicy)}>
            política de privacidade
          </Text>
          .
        </Text>
      </Checkbox>
      {error ? (
        <AppText variant="small" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </>
  );
}
