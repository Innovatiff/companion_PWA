/**
 * "Instalar Hoy": the steps an affiliate follows, on the client's phone, to put
 * Hoy on its home screen. One deck per kind of phone, in the affiliate's language.
 * The words on the drawn screens (lib/install-art.tsx) are the phone's own, in
 * the client's usual Spanish or English, so the affiliate can match what they see.
 */
import type { Lang } from "./strings.ts";

export type Phone = "android" | "iphone";
export const PHONES: Phone[] = ["android", "iphone"];

export type Art = "qr" | "camera" | "chromeMenu" | "chromeAdd" | "chromeInstall" | "safariShare" | "safariAdd" | "safariConfirm" | "home" | "code" | "done";
export type Slide = { art: Art; title: string; body: string; tip?: string };

/** The words drawn on the phone screens. */
export type ScreenWords = {
  menu: string[]; addHome: string; install: string; cancel: string; installTitle: string;
  share: string[]; addToHome: string; add: string; webApp: string; enter: string; typeCode: string;
  tagline: string; greeting: string;
};

export function screenWords(lang: Lang): ScreenWords {
  return lang === "en"
    ? {
        menu: ["New tab", "History", "Downloads", "Add to Home screen", "Settings"],
        addHome: "Add to Home screen", install: "Install", cancel: "Cancel", installTitle: "Install app",
        share: ["Copy", "Add to Favourites", "Add to Home Screen", "Find on Page"],
        addToHome: "Add to Home Screen", add: "Add", webApp: "Open as Web App", enter: "Enter", typeCode: "Enter your code",
        tagline: "Your day at a glance", greeting: "Good morning",
      }
    : {
        menu: ["Nueva pestaña", "Historial", "Descargas", "Agregar a pantalla principal", "Configuración"],
        addHome: "Agregar a pantalla principal", install: "Instalar", cancel: "Cancelar", installTitle: "Instalar app",
        share: ["Copiar", "Agregar a favoritos", "Agregar a inicio", "Buscar en la página"],
        addToHome: "Agregar a inicio", add: "Agregar", webApp: "Abrir como app web", enter: "Entrar", typeCode: "Escribe tu código",
        tagline: "Tu día en un vistazo", greeting: "Buenos días",
      };
}

export function installSlides(lang: Lang, phone: Phone, url: string, code: string | null): Slide[] {
  const es = lang !== "en";
  const typeIt = code
    ? (es ? `Escribe el código del cliente, ${code}, y toca «Entrar».` : `Type the client's code, ${code}, and tap "Enter".`)
    : (es ? "Escribe el código del cliente y toca «Entrar». Lo tienes en «Mis clientes»." : "Type the client's code and tap \"Enter\". It is in \"My clients\".");
  const scan: Slide = {
    art: "qr",
    title: es ? "Escanea este código con el teléfono del cliente" : "Scan this code with the client's phone",
    body: es
      ? "Así no tienes que escribir la dirección. Ten a mano el código de Hoy del cliente: lo vas a necesitar al final."
      : "That way you don't type the address. Keep the client's Hoy code handy: you will need it at the end.",
  };
  const home: Slide = {
    art: "home",
    title: es ? "Abre Hoy desde la pantalla de inicio" : "Open Hoy from the home screen",
    body: es ? "Sal del navegador. Busca el ícono de Hoy en la pantalla de inicio y tócalo." : "Leave the browser. Find the Hoy icon on the home screen and tap it.",
    tip: es
      ? "Ábrelo siempre desde el ícono, no desde el navegador: así el cliente queda dentro de la app."
      : "Always open it from the icon, not the browser: that keeps the client signed in to the app.",
  };
  const enter: Slide = {
    art: "code",
    title: es ? "Entra con el código" : "Sign in with the code",
    body: typeIt,
    tip: es ? "El código es la cuenta: si cambia de teléfono, escribe el mismo código otra vez." : "The code is the account: on a new phone, type the same code again.",
  };
  const done: Slide = {
    art: "done",
    title: es ? "¡Listo! Revisa estas 3 cosas" : "Done! Check these 3 things",
    body: es
      ? "El ícono de Hoy está en la pantalla de inicio. Hoy se abre sin la barra del navegador. Arriba lo saluda con su nombre («Buenos días, …» o «Buenas tardes, …»)."
      : "The Hoy icon is on the home screen. Hoy opens without the browser bar. The top greets the client by name (\"Good morning, …\" or \"Good afternoon, …\").",
    tip: es ? "Si algo no está, vuelve al paso que falta." : "If something is missing, go back to that step.",
  };

  if (phone === "iphone") {
    return [
      scan,
      {
        art: "camera",
        title: es ? "Abre la Cámara y toca el aviso amarillo" : "Open the Camera and tap the yellow banner",
        body: es ? "Apunta la cámara al código QR. Aparece un aviso amarillo que dice «Safari»: tócalo." : "Point the camera at the QR code. A yellow banner saying \"Safari\" appears: tap it.",
        tip: es
          ? `¿No aparece? Abre Safari y escribe la dirección: ${url}`
          : `Nothing appears? Open Safari and type the address: ${url}`,
      },
      {
        art: "safariShare",
        title: es ? "Toca el botón Compartir" : "Tap the Share button",
        body: es ? "Es el cuadrado con una flecha hacia arriba, en la barra de abajo." : "It is the square with an arrow pointing up, in the bottom bar.",
        tip: es
          ? "¿No lo ves? Toca los tres puntos ⋯ junto a la dirección y luego «Compartir». Tiene que ser Safari."
          : "Can't see it? Tap the three dots ⋯ next to the address, then \"Share\". It has to be Safari.",
      },
      {
        art: "safariAdd",
        title: es ? "Toca «Agregar a inicio»" : "Tap \"Add to Home Screen\"",
        body: es ? "Desliza la lista hacia arriba hasta encontrarlo." : "Swipe the list up until you find it.",
        tip: es ? "En algunos iPhone dice «Añadir a pantalla de inicio»." : "Not in the list? Scroll to the end of it: it is often near the bottom.",
      },
      {
        art: "safariConfirm",
        title: es ? "Toca «Agregar», arriba a la derecha" : "Tap \"Add\", top right",
        body: es ? "Deja el nombre «Hoy». Si ves «Abrir como app web», déjalo activado." : "Keep the name \"Hoy\". If you see \"Open as Web App\", leave it on.",
      },
      home, enter, done,
    ];
  }
  return [
    scan,
    {
      art: "camera",
      title: es ? "Abre la cámara y toca el enlace" : "Open the camera and tap the link",
      body: es ? "Apunta la cámara al código QR. Aparece un enlace de Hoy: tócalo para abrirlo en Chrome." : "Point the camera at the QR code. A Hoy link appears: tap it to open it in Chrome.",
      tip: es
        ? `¿No aparece? Usa Google Lens, o abre Chrome y escribe la dirección: ${url}`
        : `Nothing appears? Use Google Lens, or open Chrome and type the address: ${url}`,
    },
    {
      art: "chromeMenu",
      title: es ? "Toca los tres puntos ⋮" : "Tap the three dots ⋮",
      body: es ? "Están arriba a la derecha, junto a la dirección." : "They are at the top right, next to the address.",
      tip: es
        ? "Si se abrió dentro de WhatsApp, Facebook o Samsung Internet, toca ⋮ y elige «Abrir en Chrome»."
        : "If it opened inside WhatsApp, Facebook or Samsung Internet, tap ⋮ and choose \"Open in Chrome\".",
    },
    {
      art: "chromeAdd",
      title: es ? "Toca «Agregar a pantalla principal»" : "Tap \"Add to Home screen\"",
      body: es ? "Está en la lista del menú. Baja un poco si no lo ves." : "It is in the menu list. Scroll down a little if you don't see it.",
      tip: es ? "En algunos teléfonos dice «Instalar app»: es lo mismo." : "On some phones it says \"Install app\": it is the same.",
    },
    {
      art: "chromeInstall",
      title: es ? "Toca «Instalar»" : "Tap \"Install\"",
      body: es ? "Espera unos segundos: Hoy aparece en la pantalla de inicio." : "Wait a few seconds: Hoy appears on the home screen.",
      tip: es ? "Si pregunta, elige «Instalar» y no «Crear acceso directo»." : "If it asks, choose \"Install\", not \"Create shortcut\".",
    },
    home, enter, done,
  ];
}

export const PHONE_LABEL: Record<Lang, Record<Phone, string>> = {
  es: { android: "Android", iphone: "iPhone" },
  en: { android: "Android", iphone: "iPhone" },
};
