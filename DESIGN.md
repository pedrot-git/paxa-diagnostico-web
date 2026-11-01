# PAXA Lab — direção visual e UX

## Tarefa principal

O usuário abre o site no Chrome do A56 para conectar um Ai Friend Pro, registrar mudanças feitas na caixinha e exportar o diagnóstico. A primeira ação de conexão deve aparecer cedo no celular. Os marcadores registram ações físicas; não devem parecer controles remotos já implementados.

## Referências e decisões

- UI UX Pro Max: pesquisa de IoT/device monitoring confirmou a categoria Smart Home/IoT Dashboard, com status explícitos e indicadores verificáveis. A recomendação de glassmorphism foi descartada em favor de superfícies opacas legíveis. A busca de tipografia forneceu Minimal Swiss/Inter, adequado à interface funcional.
- One Page Love MCP: Resurf, Pairio e Plastic. Aplicados os princípios de uma ação principal reconhecível, contraste entre título e instruções e visual do produto com função clara. Nenhum texto, screenshot ou identidade desses sites foi incorporado ao produto.
- Taste Index: objetivo compreensível em poucos segundos, texto direto, hierarquia por tamanho e peso, escala de espaçamento consistente, controle de ruído visual e revisão em telas pequenas. Não há prova social ou números fictícios.
- A1 Gallery MCP: registrado e autenticado no Codex. Seu catálogo de ferramentas exige reinício da conexão no cliente para uso em novos turnos; nenhuma consulta autenticada de conteúdo foi presumida neste trabalho.

## Sistema

- Fonte: Inter local, pesos 400–700, com fallback do sistema e `font-display: swap`. Monoespaçada do sistema apenas para UUIDs e horários.
- Escala: 48/36/28/22/18/16/14/12px. Texto principal de 16px; rótulos secundários nunca abaixo de 12px.
- Neutros: fundo #101415, superfície #181E20, superfície elevada #20282A, texto #F1F6F3, secundário #B0BDB8. Acento #91E7BF apenas em ações e status relevantes.
- Espaçamento: base de 4/8px; controles de 48px; raios 12/20px; conteúdo até 1184px. Grade de duas colunas no desktop; ordem da tarefa preservada no celular.
- Ícones: SVG em uma mesma espessura, com texto acessível para controles e ícones decorativos ocultos da árvore de acessibilidade.
- Movimento: feedback breve de estado; sem animação ornamental contínua. `prefers-reduced-motion` respeitado.

## Comportamentos

- Estado inicial explica como conectar e diferencia relatório anterior de uma conexão atual.
- Validação de UUID fica junto ao campo e em um resumo de erro com foco; nenhuma tentativa de abrir o seletor Bluetooth se a validação falhar.
- Contagem de notificações é restaurada a partir do relatório, preservando a interpretação dos dados.
- Histórico usa botões de filtro com estado `aria-pressed`; não altera o relatório exportado.
- Exportação permanece local, por escolha do usuário, sem backend ou coleta automática.

## Fontes

- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://onepagelove.com/resurf/
- https://onepagelove.com/pairio/
- https://onepagelove.com/plastic/
- https://github.com/admud/taste-index
- https://www.a1.gallery/mcp
