import type { MessageKey } from "./en";

/**
 * Português (Brasil).
 *
 * Register: natural Brazilian Portuguese, "você" form, no machine-translation
 * stiffness. Suggestion-chip prompts are idiomatic model input, not label
 * translations. Reviewed in situ by a native speaker before release
 * (see docs/i18n.md, review checklist).
 *
 * `satisfies` makes a missing or extra key a compile error.
 */
export const ptBR = {
  // Chat thread
  "thread.welcome": "Olá, eu sou o BT Servant. Como posso servir você hoje?",
  "thread.disclaimer": "O BT Servant pode cometer erros. Confira as respostas.",
  "thread.thinking": "Pensando...",
  "thread.scrollToBottom": "Rolar até o fim",

  // Suggestion chips
  "thread.suggestion.translate.label": "Me ajude a traduzir João 3:16",
  "thread.suggestion.translate.prompt": "Me ajude a traduzir João 3:16",
  "thread.suggestion.summarize.label": "Resuma Gênesis 1:1-5",
  "thread.suggestion.summarize.prompt": "Você pode resumir Gênesis 1:1-5?",
  "thread.suggestion.amos.label": "Fale sobre Amós",
  "thread.suggestion.amos.prompt": "Fale sobre Amós na Bíblia",

  // Composer
  "composer.placeholder": "Como posso ajudar você hoje?",
  "composer.voiceButton": "Mensagem de voz",

  // Messages
  "message.voiceMessage": "Mensagem de voz",
  "message.showTranscript": "Mostrar transcrição",
  "message.hideTranscript": "Ocultar transcrição",
  "message.deliveryFailed":
    "Desculpe, não consegui entregar uma resposta. Tente novamente.",
  "message.copyCode": "Copiar",

  // Streaming status and runtime errors
  "status.connecting": "Conectando...",
  "error.connectionLost": "A conexão foi perdida. Tente novamente.",
  "error.generic": "Desculpe, ocorreu um erro. Tente novamente.",
  "error.timeout":
    "Desculpe, isso demorou demais e a resposta foi interrompida. Tente novamente.",

  // Voice recorder
  "recorder.recording": "Gravando...",
  "recorder.starting": "Iniciando...",

  // User menu
  "userMenu.aria": "Menu do usuário",
  "userMenu.signOut": "Sair",
  "userMenu.signOutDescription": "Encerrar sua sessão atual",

  // Login page
  "login.headline": "Traduza a Palavra de Deus ainda melhor.",
  "login.subheadline":
    "Interface de conversação para recursos de tradução selecionados",
  "login.continueWithGoogle": "Continuar com o Google",
  "login.signingIn": "Entrando...",

  // Global error boundary
  "globalError.heading": "Algo deu errado.",
  "globalError.retry": "Tentar novamente",
} satisfies Record<MessageKey, string>;
