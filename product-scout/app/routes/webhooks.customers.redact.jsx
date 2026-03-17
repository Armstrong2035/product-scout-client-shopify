import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received mandatory ${topic} webhook for ${shop}`);
  return new Response("Customer redact request received", { status: 200 });
};
