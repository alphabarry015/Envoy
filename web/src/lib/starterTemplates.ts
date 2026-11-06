import activation from "./reactEmailGallery/activation.html?raw";
import airbnbReview from "./reactEmailGallery/airbnb-review.html?raw";
import dropboxResetPassword from "./reactEmailGallery/dropbox-reset-password.html?raw";
import nikeReceipt from "./reactEmailGallery/nike-receipt.html?raw";
import notionMagicLink from "./reactEmailGallery/notion-magic-link.html?raw";
import productUpdate from "./reactEmailGallery/product-update.html?raw";
import stackOverflowTips from "./reactEmailGallery/stack-overflow-tips.html?raw";
import stripeWelcome from "./reactEmailGallery/stripe-welcome.html?raw";
import subscriptionUpdate from "./reactEmailGallery/subscription-update.html?raw";
import textOnly from "./reactEmailGallery/text-only.html?raw";
import vercelInviteUser from "./reactEmailGallery/vercel-invite-user.html?raw";
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
  {
    id: "notion-magic-link",
    name: "Notion magic link",
    alias: "notion-magic-link",
    subject: "Log in with this magic link",
    html: notionMagicLink,
  },
  {
    id: "stack-overflow-tips",
    name: "Stack Overflow tips",
    alias: "stack-overflow-tips",
    subject: "Stack Overflow tips for searching",
    html: stackOverflowTips,
  },
  {
    id: "vercel-invite-user",
    name: "Vercel invite",
    alias: "vercel-invite",
    subject: "Join Alan on Vercel",
    html: vercelInviteUser,
  },
  {
    id: "nike-receipt",
    name: "Nike receipt",
    alias: "nike-receipt",
    subject: "Your Nike order summary",
    html: nikeReceipt,
  },
  {
    id: "dropbox-reset-password",
    name: "Dropbox reset",
    alias: "dropbox-reset-password",
    subject: "Dropbox reset your password",
    html: dropboxResetPassword,
  },
  {
    id: "airbnb-review",
    name: "Airbnb review",
    alias: "airbnb-review",
    subject: "Read Alex's review",
    html: airbnbReview,
  },
  {
    id: "stripe-welcome",
    name: "Stripe welcome",
    alias: "stripe-welcome",
    subject: "You're ready to take payments with Stripe",
    html: stripeWelcome,
  },
  {
    id: "text-only",
    name: "Text only",
    alias: "text-only",
    subject: "A note from Barebones",
    html: textOnly,
  },
  {
    id: "product-update",
    name: "Product update",
    alias: "product-update",
    subject: "What's new at Barebones",
    html: productUpdate,
  },
  {
    id: "subscription-update",
    name: "Plan renewal",
    alias: "plan-renewal",
    subject: "Your Collage plan renewed (Pro)",
    html: subscriptionUpdate,
  },
];
