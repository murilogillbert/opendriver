import { env } from '@/config/env';
import { tokenStorage } from './client';

/**
 * Envia a foto de perfil para `POST /api/v1/uploads/image` **do hub** e devolve a URL gravada.
 *
 * ============================================================================
 * Por que o hub, e não a API do opendriver
 * ============================================================================
 *
 * O storage daqui é privado e cifrado (AES-256-GCM), feito para documento de motorista e
 * gravação de corrida: nada nele é legível sem passar pela API. Avatar é **público** — aparece
 * no `PersonCard` do outro lado da corrida —, e o hub já tem a rota, o bucket público e a
 * validação por magic bytes.
 *
 * E não acrescenta dependência de host: o avatar **já** é lido do hub (`resolveImageUrl` resolve
 * `/uploads` contra `hubOrigin`). Enviar para onde ele é lido é o consistente.
 *
 * O token é aceito nos dois serviços: assinam HS256 com o mesmo `JWT_SECRET` e o mesmo par
 * issuer/audience (`opendriverhub`).
 *
 * ============================================================================
 * Por que XMLHttpRequest e não `fetch`
 * ============================================================================
 *
 * O `fetch` que o Expo instala **rejeita** a parte `{ uri, name, type }` do React Native com
 * `Unsupported FormDataPart implementation`. É a mesma pedra em que o app do anunciante bateu,
 * onde **todo** envio de criativo falhava até o transporte virar XHR. O `XMLHttpRequest` do
 * React Native entende essa parte e faz streaming a partir do disco.
 */

const TIMEOUT_MS = 60_000;

export async function uploadImage(arquivo: {
  uri: string;
  name: string;
  type: string;
}): Promise<string> {
  const token = await tokenStorage.getAccessToken();
  if (!token) throw new Error('Sessão expirada. Entre de novo.');

  return new Promise<string>((resolve, reject) => {
    const form = new FormData();
    // Campo `file`: é o que `upload.single('file')` espera no hub.
    form.append('file', arquivo as unknown as Blob);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${env.hubApiUrl}/api/v1/uploads/image`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    /**
     * `Content-Type` **não** é definido: o runtime precisa gerar o `boundary` do multipart.
     * Definir à mão produz um corpo que o multer não separa, e o erro que chega é "Nenhum
     * arquivo enviado" — que manda quem investiga para o lado errado.
     */
    xhr.timeout = TIMEOUT_MS;

    xhr.onload = (): void => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let mensagem = `Falha ao enviar a imagem (HTTP ${xhr.status}).`;
        try {
          const corpo = JSON.parse(xhr.responseText) as { error?: string };
          if (corpo?.error) mensagem = corpo.error;
        } catch {
          // Corpo não-JSON (nginx, por exemplo). A mensagem padrão serve.
        }
        reject(new Error(mensagem));
        return;
      }
      try {
        const corpo = JSON.parse(xhr.responseText) as { data?: { url?: string }; url?: string };
        const url = corpo.data?.url ?? corpo.url;
        if (!url) {
          reject(new Error('O servidor não devolveu a URL da imagem.'));
          return;
        }
        resolve(url);
      } catch {
        reject(new Error('Resposta inesperada do servidor.'));
      }
    };
    xhr.onerror = (): void => reject(new Error('Sem conexão para enviar a imagem.'));
    xhr.ontimeout = (): void => reject(new Error('O envio demorou demais. Tente de novo.'));

    xhr.send(form);
  });
}
