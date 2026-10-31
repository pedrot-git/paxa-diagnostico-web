# PAXA Diagnóstico Web

Site estático para testar as interfaces Bluetooth LE do Ai Friend Pro pelo Chrome no Android. Não requer instalação de APK nem backend. Os dados ficam no navegador até o usuário exportar o relatório.

## Publicação no GitHub Pages

O site está em `docs/`. Ative GitHub Pages a partir da branch `main`, pasta `/docs`. O arquivo `.nojekyll` está incluído. Todos os caminhos são relativos, compatíveis com o endereço de um projeto no GitHub Pages.

## Uso no A56

1. Abra o endereço **HTTPS** do site no **Chrome**, com o Bluetooth ligado. Retire os fones da caixa e acenda a telinha.
2. Toque em **Selecionar fone e diagnosticar** e escolha o fone ou a caixinha na lista BLE do Chrome.
3. Se não aparecerem, desconecte-os temporariamente do notebook. A entrada de áudio Bluetooth pode não ser uma entrada BLE acessível ao site.
4. Depois do diagnóstico, alterne os modos existentes na telinha e use os marcadores do site para registrar cada mudança.
5. Toque em **Baixar relatório JSON** e anexe o arquivo na conversa. Também é possível baixar em texto ou compartilhar os dois arquivos pelo menu do Android.

Por padrão são solicitados os serviços padrão de bateria e informação do dispositivo. O navegador só permite examinar serviços autorizados previamente. Para serviços proprietários, informe seus UUIDs na seção avançada ou importe a lista de um relatório JSON do APK. Escolha o fone novamente depois de alterar os UUIDs.

## Limites

- Somente BLE/GATT: sem consulta SDP, conexão de áudio Bluetooth clássica ou captura de tráfego entre caixinha e fones.
- O ID mostrado no relatório é atribuído pelo navegador, não é o MAC do aparelho.
- A lista de serviços não é uma descoberta irrestrita de todos os serviços do fone.
- Não há comandos proprietários nem alteração dos modos. As operações são conexão, leitura e assinatura padrão de notificações/indicações.
- Nenhum serviço acessível não significa que o fone não tenha outras interfaces.
- O GitHub Pages não recebe os relatórios. Não há envio automático, formulário de coleta ou credenciais no código.
- A página HTTP do notebook pode ser usada para prévia, mas o Chrome no celular exige HTTPS para Web Bluetooth.

## Desenvolvimento e verificação

Sem dependências de terceiros, sem etapa de build. Testes com Node.js:

```sh
node --test tests/*.test.mjs
```

Os testes simulam periféricos e cobrem leituras, notificações, callbacks após desconexão, operações sequenciais, timeout, serviços bloqueados, importação de UUIDs e exportação. Esses testes não substituem a validação no A56 com o fone real.

Fontes oficiais: [Web Bluetooth no Chrome](https://developer.chrome.com/docs/capabilities/bluetooth) e [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
