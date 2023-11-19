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

/**
 * DigitalTwin model type
 */
export enum ModelType {
  Interface = "Interface"
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
    /* TODO: must import main template as the last one */
    files.forEach(file => {
      vscode.workspace.openTextDocument(file.fsPath).then(document => {
        const text = document.getText();
        const json = JSON.parse(text);
        if (!Array.isArray(json)) {
          // discard exported json files
          if (json["@id"].includes(`${boardName}:${firmwareName}`)) {
            this.outputChannel.info(json["@id"]);
            this.importModel(folder, file.fsPath);
          }
        }
      });
    });
    this.outputChannel.end("Finalizing device model", this.component);
    return;
  }

  private async importModel(folder: string, file: string) {
    child.exec(`cd "${folder}" && dmr-client import --model-file "${file}"`, (err, stdout, stderr) => {
      this.outputChannel.info(stdout);
      if (err) {
        this.outputChannel.error(stderr);
      }
    });
  }

  private async validateModel() {
    child.exec("dmr-client validate -m sdl.expanded.json", (err, stdout, stderr) => {
      console.log("stdout: " + stdout);
      console.log("stderr: " + stderr);
      if (err) {
        console.log("error: " + err);
      }
    });
  }
}
