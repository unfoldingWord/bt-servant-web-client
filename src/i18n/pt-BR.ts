import type { Dictionary } from "./en";

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
  "thread.welcome": "Olá, sou o BT Servant. Como posso te servir hoje?",
  "thread.disclaimer": "O BT Servant pode cometer erros. Confira as respostas.",
  "thread.thinking": "Pensando...",
  "thread.scrollToBottom": "Rolar até o fim",

  // Suggestion chips. Where the natural request is already imperative
  // (translate, summarize) the label and prompt coincide; see en.ts.
  "thread.suggestion.translate.label": "Me ajude a traduzir João 3:16",
  "thread.suggestion.translate.prompt": "Me ajude a traduzir João 3:16",
  "thread.suggestion.summarize.label": "Resuma Gênesis 1:1-5",
  "thread.suggestion.summarize.prompt": "Resuma Gênesis 1:1-5",
  "thread.suggestion.amos.label": "Fale sobre Amós",
  "thread.suggestion.amos.prompt": "Fale sobre Amós na Bíblia",

  // Composer
  "composer.placeholder": "Como posso te ajudar hoje?",
  "composer.send": "Enviar",
  "composer.voiceButton": "Mensagem de voz",

  // Messages
  "message.voiceMessage": "Mensagem de voz",
  "message.showTranscript": "Mostrar transcrição",
  "message.hideTranscript": "Ocultar transcrição",
  "message.deliveryFailed":
    "Desculpe, não consegui gerar uma resposta. Tente novamente.",
  "message.copy": "Copiar mensagem",
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
  "recorder.cancel": "Cancelar",
  "recorder.stop": "Parar",

  // User menu
  "userMenu.trigger": "Menu do usuário",
  "userMenu.language": "Idioma",
  "userMenu.languageLockedWhileReplying": "Disponível após a resposta atual",
  "userMenu.signOut": "Sair",
  "userMenu.signOutDescription": "Encerrar sua sessão atual",

  // Login page
  "login.heading": "Traduza a Palavra de Deus ainda melhor.",
  "login.subheading":
    "Interface conversacional para recursos de tradução criteriosamente selecionados",
  "login.continueWithGoogle": "Continuar com o Google",
  "login.signingIn": "Entrando...",

  // Global error boundary
  "globalError.heading": "Algo deu errado.",
  "globalError.retry": "Tentar novamente",
} satisfies Dictionary;
