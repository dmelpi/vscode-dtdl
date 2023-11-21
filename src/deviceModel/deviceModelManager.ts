// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { ColorizedChannel } from "../common/colorizedChannel";
import { Constants } from "../common/constants";
import { ProcessError } from "../common/processError";
import { Utility } from "../common/utility";
import { MessageType, UI } from "../view/ui";
import { UIConstants } from "../view/uiConstants";
import * as child from "child_process";
import * as fs from "fs-extra";

/**
 * DigitalTwin model type
 */
export enum ModelType {
  Interface = "Interface"
}

interface dmComponent {
  id: string;
  file: string;
  jsonContent?: JSON;
}

/**
 * DigitalTwin device model manager
 */
export class DeviceModelManager {
  /**
   * generate DigitalTwin model id
   * @param name model name
   */
  public static generateModelId(name: string): string {
    return `dtmi:appconfig:${name};1`;
  }

  /**
   * generate DigitalTwin model file name
   * @param name model name
   * @param type model type
   */
  public static generateModelFileName(name: string): string {
    return `${name}.json`;
  }

  public myStatusBarItem: vscode.StatusBarItem | undefined;

  private readonly component: string;
  constructor(private readonly context: vscode.ExtensionContext, private readonly outputChannel: ColorizedChannel) {
    this.component = Constants.DEVICE_MODEL_COMPONENT;
  }

  /**
   * create DigitalTwin model with UI interaction
   * @param type model type
   */
  public async createModel(type: ModelType): Promise<void> {
    const folder: string = await UI.selectRootFolder(UIConstants.SELECT_ROOT_FOLDER_LABEL);
    const boardName = await UI.showInputBox("Board name", "Board name");
    const firmwareName = await UI.showInputBox("Firmware name", "Firmware name");
    await this.context.globalState.update("dtdl-board", boardName);
    await this.context.globalState.update("dtdl-firmware", firmwareName);
    const name = `${boardName}:${firmwareName}`;
    const templateFolder: string = this.context.asAbsolutePath(path.join(Constants.TEMPLATE_FOLDER));
    const template = "device_model.json";
    const operation = `Create ${type} "${name}" in folder ${folder} by template "${template}"`;
    this.updateStatusBar();
    this.outputChannel.start(operation, this.component);

    let filePath: string;
    const fileName = `${boardName}_${firmwareName}`;
    try {
      filePath = await this.doCreateVespucciModel(
        folder,
        boardName,
        firmwareName,
        fileName,
        path.join(templateFolder, template)
      );
    } catch (error) {
      throw new ProcessError(operation, error, this.component);
    }

    await UI.openAndShowTextDocument(filePath);
    UI.showNotification(MessageType.Info, ColorizedChannel.formatMessage(operation));
    this.outputChannel.end(operation, this.component);
  }

  public async addInterface(interfaceType: string): Promise<void> {
    const folder: string = await UI.selectRootFolder(UIConstants.SELECT_ROOT_FOLDER_LABEL);
    const template: string = path.join(
      this.context.asAbsolutePath(path.join(Constants.TEMPLATE_FOLDER)),
      interfaceType
    );
    const interfaceName = await UI.showInputBox("Interface name", "Interface name");
    const boardName: string = this.context.globalState.get<string>("dtdl-board") ?? "board";
    const firmwareName = this.context.globalState.get<string>("dtdl-firmware") ?? "firmware";

    const operation = `Create "${interfaceName}" in folder ${folder} by template "${template}"`;
    let filePath: string;
    try {
      filePath = await this.doCreateVespucciModel(folder, boardName, firmwareName, interfaceName, template);
    } catch (error) {
      throw new ProcessError(operation, error, this.component);
    }
    await UI.openAndShowTextDocument(filePath);
  }

  /**
   * create DigitalTwin model
   * @param folder root folder
   * @param name model name
   * @param templatePath template file path
   */
  private async doCreateModel(folder: string, name: string, templatePath: string): Promise<string> {
    const modelId: string = DeviceModelManager.generateModelId(name);
    const filePath: string = path.join(folder, DeviceModelManager.generateModelFileName(name));
    const replacement = new Map<string, string>();
    replacement.set(Constants.MODEL_ID_PLACEHOLDER, modelId);
    replacement.set(Constants.MODEL_NAME_PLACEHOLDER, name);
    await Utility.createFileFromTemplate(templatePath, filePath, replacement);
    return filePath;
  }

  private async doCreateVespucciModel(
    folder: string,
    board: string,
    firmware: string,
    name: string,
    templatePath: string
  ): Promise<string> {
    const modelId: string = DeviceModelManager.generateModelId(name);
    const filePath: string = path.join(folder, DeviceModelManager.generateModelFileName(name));
    const replacement = new Map<string, string>();
    replacement.set(Constants.MODEL_ID_PLACEHOLDER, modelId);
    replacement.set(Constants.MODEL_NAME_PLACEHOLDER, name);
    replacement.set(Constants.MODEL_BOARD_PLACEHOLDER, board);
    replacement.set(Constants.MODEL_FIRMWARE_PLACEHOLDER, firmware);
    await Utility.createFileFromTemplate(templatePath, filePath, replacement);
    return filePath;
  }

  public async finalizeModel(): Promise<void> {
    const folder: string = await UI.selectRootFolder(UIConstants.SELECT_ROOT_FOLDER_LABEL);
    const files = await vscode.workspace.findFiles("**/*.json", "dtmi/**");
    const boardName: string = this.context.globalState.get<string>("dtdl-board") ?? "board";
    const firmwareName = this.context.globalState.get<string>("dtdl-firmware") ?? "firmware";
    this.outputChannel.start("Finalizing device model", this.component);
    this.outputChannel.info(`Board name: ${boardName}; firmware name: ${firmwareName}`);
    let mainFile = "";
    const ids: dmComponent[] = [];
    files.forEach(file => {
      vscode.workspace.openTextDocument(file.fsPath).then(document => {
        const text = document.getText();
        const json = JSON.parse(text);
        if (!Array.isArray(json)) {
          const id = json["@id"];
          // discard exported json files
          if (id.includes(`${boardName}:${firmwareName}`)) {
            if (id.split(":").length === 4) {
              /* the main model file must be processed as the last one */
              mainFile = file.fsPath;
              this.outputChannel.info(`Main model file: ${mainFile}`);
            } else {
              this.outputChannel.info(id);
              this.importModel(folder, file.fsPath);
              ids.push({ id: id, file: file.fsPath });
            }
          }
        }
      });
    });
    /* we need to wait until all files have been written, otherwise the main model 
    will not find them in the fs and an error will be generated, the current solution 
    is ugly (a delay...) and should be implemented better with file watchers */
    await new Promise((resolve, reject) => setTimeout(() => resolve(true), 2000));
    /* TODO: add components to main file before importing it */
    fs.readJson(mainFile, (err, dm) => {
      if (err) console.error(err);
      dm.contents = [];
      ids.forEach(comp => {
        this.outputChannel.info(comp.id);
        const name = comp.id
          .split(":")
          .pop()
          ?.split(";")[0];
        dm.contents.push({ "@type": "Component", name: name, schema: comp.id });
      });
      fs.writeJSON(mainFile, dm, { spaces: Constants.JSON_SPACE, encoding: Constants.UTF8 });
    });

    /* write back modified object to file and finally import it */
    this.importModel(folder, mainFile);
    /* TODO export model */
    this.outputChannel.end("Finalizing device model", this.component);
    return;
  }

  public async updateStatusBar() {
    const boardName: string = this.context.globalState.get<string>("dtdl-board") ?? "board";
    const firmwareName = this.context.globalState.get<string>("dtdl-firmware") ?? "firmware";
    if (this.myStatusBarItem != undefined) {
      this.myStatusBarItem.text = `[Vespucci DTDL] ${boardName}:${firmwareName}`;
      this.myStatusBarItem.tooltip = `Current device model namespace is dtmi:appconfig:${boardName}:${firmwareName};1 \
\nTo change it, create a new device model.`;
      this.myStatusBarItem?.show();
    }
  }

  private async importModel(folder: string, file: string) {
    child.exec(`cd "${folder}" && dmr-client import --model-file "${file}"`, (err, stdout, stderr) => {
      this.outputChannel.info(stdout);
      if (err) {
        this.outputChannel.error(stderr);
      }
    });
  }

  private async exportModel(folder: string) {
    const boardName: string = this.context.globalState.get<string>("dtdl-board") ?? "board";
    const firmwareName = this.context.globalState.get<string>("dtdl-firmware") ?? "firmware";
    child.exec(
      `cd "${folder}" && dmr-client export --dtmi "dtmi:appconfig:${boardName}:${firmwareName};1" --repo . \
      > ${boardName}_${firmwareName}.expanded.json`,
      (err, stdout, stderr) => {
        console.log("stdout: " + stdout);
        console.log("stderr: " + stderr);
        if (err) {
          console.log("error: " + err);
        }
      }
    );
  }
}
