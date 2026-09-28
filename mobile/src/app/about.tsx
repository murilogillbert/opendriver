import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { ListRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { AppText, Card } from '@/components/ui/primitives';
import { env, links } from '@/config/env';
import { spacing } from '@/theme/tokens';

export default function About() {
  return (
    <Screen>
      <Card style={{ padding: spacing.xs }}>
        <ListRow icon="mail-outline" title="Falar com o suporte" subtitle={links.supportEmail} onPress={() => void Linking.openURL(`mailto:${links.supportEmail}`)} />
        <ListRow icon="document-text-outline" title="Termos de uso" onPress={() => void WebBrowser.openBrowserAsync(links.terms)} />
        <ListRow icon="eye-outline" title="Política de privacidade" onPress={() => void WebBrowser.openBrowserAsync(links.privacyPolicy)} />
        <ListRow icon="map-outline" title="Dados do mapa" subtitle="© Colaboradores do OpenStreetMap" onPress={() => void WebBrowser.openBrowserAsync('https://www.openstreetmap.org/copyright')} />
      </Card>
      <AppText variant="small" center>
        OpenDriver {Application.nativeApplicationVersion ?? ''} ({Application.nativeBuildVersion ?? '—'}){env.variant !== 'production' ? ` · ${env.variant}` : ''}
      </AppText>
    </Screen>
  );
}
