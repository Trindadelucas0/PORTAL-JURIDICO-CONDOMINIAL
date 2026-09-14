import { ChannelType } from "@prisma/client";
import { DevMockProvider } from "@/lib/channels/dev-mock-provider";
import { EvolutionBaileysProvider } from "@/lib/channels/evolution-baileys-provider";
import { EvolutionCloudProvider } from "@/lib/channels/evolution-cloud-provider";
import type { WhatsAppProvider } from "@/lib/channels/whatsapp-provider";

export function providerFor(type: ChannelType): WhatsAppProvider {
  switch (type) {
    case "dev_mock":
      return new DevMockProvider();
    case "evolution_baileys":
      return new EvolutionBaileysProvider();
    case "evolution_cloud":
      return new EvolutionCloudProvider();
    default:
      return new DevMockProvider();
  }
}
