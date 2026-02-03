import { AqPlugin } from "../infrastructure/aqPlugin";
import { JsonPlugin } from "../plugins/jsonPlugin";
import { YamlPlugin } from "../plugins/yamlPlugin";
import { XmlPlugin } from "../plugins/xmlPlugin";
import { TomlPlugin } from "../plugins/tomlPlugin";
import { IniPlugin } from "../plugins/iniPlugin";
import { TextPlugin, PlainTextPlugin } from "../plugins/textPlugin";
import { detectPlugin } from "../utils";

export class PluginManager {
  private plugins: AqPlugin[] = [
    JsonPlugin,
    YamlPlugin,
    XmlPlugin,
    TomlPlugin,
    IniPlugin,
    TextPlugin,
    PlainTextPlugin
  ];

  getPlugins(): AqPlugin[] {
    return this.plugins;
  }

  getPluginByName(name: string): AqPlugin | undefined {
    return this.plugins.find(
      (plugin) => plugin.name.toLowerCase() === name.toLowerCase()
    );
  }

  detectPlugin(filename: string | undefined, input: string | undefined, context: Record<string, unknown>): AqPlugin | undefined {
    return detectPlugin(this.plugins, filename, input, context);
  }

  getDefaultPlugin(): AqPlugin {
    return this.plugins[0]; // JSON
  }
}
