import activation from "./reactEmailGallery/activation.html?raw";
import arcaneAbandonedCart from "./reactEmailGallery/arcane-abandoned-cart.html?raw";
import arcaneNewsletter from "./reactEmailGallery/arcane-newsletter.html?raw";
import arcaneOrderConfirmation from "./reactEmailGallery/arcane-order-confirmation.html?raw";
import arcanePromo from "./reactEmailGallery/arcane-promo.html?raw";
import featureAnnouncement from "./reactEmailGallery/feature-announcement.html?raw";
import matteProductUpdate from "./reactEmailGallery/matte-product-update.html?raw";
import matteWelcome from "./reactEmailGallery/matte-welcome.html?raw";
import passwordReset from "./reactEmailGallery/password-reset.html?raw";
import protocolActivation from "./reactEmailGallery/protocol-activation.html?raw";
import protocolWelcome from "./reactEmailGallery/protocol-welcome.html?raw";
import studioOrderShipping from "./reactEmailGallery/studio-order-shipping.html?raw";
import studioWelcome from "./reactEmailGallery/studio-welcome.html?raw";
import subscriptionConfirmation from "./reactEmailGallery/subscription-confirmation.html?raw";
import welcome from "./reactEmailGallery/welcome.html?raw";

export type StarterTemplate = {
  id: string;
  name: string;
  alias: string;
  subject: string;
  html: string;
};

/** React Email demo layouts shown in the Templates gallery. */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "activation",
    name: "Activation",
    alias: "activation",
    subject: "Confirm your email address",
    html: activation,
  },
  {
    id: "welcome",
    name: "Welcome",
    alias: "welcome",
    subject: "Welcome aboard",
    html: welcome,
  },
  {
    id: "password-reset",
    name: "Password reset",
    alias: "password-reset",
    subject: "Reset your password",
    html: passwordReset,
  },
  {
    id: "feature-announcement",
    name: "Feature announcement",
    alias: "feature-announcement",
    subject: "Release notes",
    html: featureAnnouncement,
  },
  {
    id: "subscription-confirmation",
    name: "Subscription",
    alias: "subscription",
    subject: "You're subscribed",
    html: subscriptionConfirmation,
  },
  {
    id: "matte-welcome",
    name: "Collage welcome",
    alias: "collage-welcome",
    subject: "Welcome to Collage",
    html: matteWelcome,
  },
  {
    id: "matte-product-update",
    name: "Collage updates",
    alias: "collage-updates",
    subject: "Your monthly Collage product updates",
    html: matteProductUpdate,
  },
  {
    id: "protocol-activation",
    name: "Dither activation",
    alias: "dither-activation",
    subject: "Confirm your email address",
    html: protocolActivation,
  },
  {
    id: "protocol-welcome",
    name: "Dither welcome",
    alias: "dither-welcome",
    subject: "Welcome to Dither",
    html: protocolWelcome,
  },
  {
    id: "arcane-abandoned-cart",
    name: "Abandoned cart",
    alias: "abandoned-cart",
    subject: "Your cart is waiting",
    html: arcaneAbandonedCart,
  },
  {
    id: "arcane-order-confirmation",
    name: "Order confirmation",
    alias: "order-confirmation",
    subject: "Your order is confirmed",
    html: arcaneOrderConfirmation,
  },
  {
    id: "arcane-newsletter",
    name: "Newsletter",
    alias: "newsletter",
    subject: "The latest from Skin",
    html: arcaneNewsletter,
  },
  {
    id: "arcane-promo",
    name: "Promo",
    alias: "promo",
    subject: "Your promo code",
    html: arcanePromo,
  },
  {
    id: "studio-order-shipping",
    name: "Shipping",
    alias: "order-shipping",
    subject: "Your order has shipped",
    html: studioOrderShipping,
  },
  {
    id: "studio-welcome",
    name: "Halo welcome",
    alias: "halo-welcome",
    subject: "Welcome to Halo",
    html: studioWelcome,
  },
];
