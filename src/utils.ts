import { AqPlugin } from "./infrastructure/aqPlugin.ts";

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  } else if (typeof error === "string") {
    return error;
  } else {
    return JSON.stringify(error, null, 2);
  }
}

// Helper function to detect the appropriate plugin
export function detectPlugin(plugins : AqPlugin[], filename: string | undefined, input: string | undefined): AqPlugin | undefined {
  let foundPlugins = plugins.filter((plugin) => plugin.detect(filename, input));
  
  // If no plugin was found based on filename, check if any plugin can decode the input
  if(foundPlugins.length == 0 && input) {
    foundPlugins = plugins.filter((plugin) => {
      try {
        plugin.decode(input); 
        return true;
      } catch {
        return false;
      }
    });
  }
  
  if(foundPlugins.length == 1) {
    return foundPlugins[0];
  } else if(foundPlugins.length > 1) {
    console.error(`❌ Multiple plugins detected: ${foundPlugins.map(p=>p.name)}. Please specify the format explicitly.`);
  } else {
    return undefined;
  }
}