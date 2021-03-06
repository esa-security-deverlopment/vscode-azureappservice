/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SiteConfigResource, User } from 'azure-arm-website/lib/models';
import * as portfinder from 'portfinder';
import * as vscode from 'vscode';
import { SiteClient, TunnelProxy } from 'vscode-azureappservice';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { SiteTreeItem } from '../../explorer/SiteTreeItem';
import { WebAppTreeItem } from '../../explorer/WebAppTreeItem';
import { ext } from '../../extensionVariables';
import * as remoteDebug from './remoteDebugCommon';

let isRemoteDebugging = false;

export async function startRemoteDebug(actionContext: IActionContext, node?: SiteTreeItem): Promise<void> {
    if (isRemoteDebugging) {
        throw new Error('Azure Remote Debugging is currently starting or already started.');
    }

    isRemoteDebugging = true;
    try {
        await startRemoteDebugInternal(actionContext, node);
    } catch (error) {
        isRemoteDebugging = false;
        throw error;
    }
}

async function startRemoteDebugInternal(actionContext: IActionContext, node?: SiteTreeItem): Promise<void> {
    if (!node) {
        node = <SiteTreeItem>await ext.tree.showTreeItemPicker(WebAppTreeItem.contextValue);
    }
    const siteClient: SiteClient = node.root.client;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification }, async (progress: vscode.Progress<{}>): Promise<void> => {
        remoteDebug.reportMessage('Fetching site configuration...', progress);
        const siteConfig: SiteConfigResource = await siteClient.getSiteConfig();

        remoteDebug.checkForRemoteDebugSupport(siteConfig, actionContext);
        const debugConfig: vscode.DebugConfiguration = await getDebugConfiguration();
        // tslint:disable-next-line:no-unsafe-any
        const localHostPortNumber: number = debugConfig.port;

        remoteDebug.reportMessage('Checking app settings...', progress);

        const confirmEnableMessage: string = 'The app configuration will be updated to enable remote debugging and restarted. Would you like to continue?';
        await remoteDebug.setRemoteDebug(true, confirmEnableMessage, undefined, siteClient, siteConfig, progress, remoteDebug.remoteDebugLink);

        remoteDebug.reportMessage('Starting tunnel proxy...', progress);

        const publishCredential: User = await siteClient.getWebAppPublishCredential();
        const tunnelProxy: TunnelProxy = new TunnelProxy(localHostPortNumber, siteClient, publishCredential);
        await callWithTelemetryAndErrorHandling('appService.remoteDebugStartProxy', async function (this: IActionContext): Promise<void> {
            this.suppressErrorDisplay = true;
            this.rethrowError = true;
            await tunnelProxy.startProxy();
        });

        remoteDebug.reportMessage('Attaching debugger...', progress);

        await callWithTelemetryAndErrorHandling('appService.remoteDebugAttach', async function (this: IActionContext): Promise<void> {
            this.suppressErrorDisplay = true;
            this.rethrowError = true;
            await vscode.debug.startDebugging(undefined, debugConfig);
        });

        remoteDebug.reportMessage('Attached!', progress);

        const terminateDebugListener: vscode.Disposable = vscode.debug.onDidTerminateDebugSession(async (event: vscode.DebugSession) => {
            if (event.name === debugConfig.name) {
                isRemoteDebugging = false;

                if (tunnelProxy !== undefined) {
                    tunnelProxy.dispose();
                }
                terminateDebugListener.dispose();

                const confirmDisableMessage: string = 'Leaving the app in debugging mode may cause performance issues. Would you like to disable debugging for this app? The app will be restarted.';
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification }, async (innerProgress: vscode.Progress<{}>): Promise<void> => {
                    await remoteDebug.setRemoteDebug(false, confirmDisableMessage, undefined, siteClient, siteConfig, innerProgress, remoteDebug.remoteDebugLink);
                });
            }
        });
    });
}

async function getDebugConfiguration(): Promise<vscode.DebugConfiguration> {
    const sessionId: string = Date.now().toString();
    const portNumber: number = await portfinder.getPortPromise();

    // So far only node is supported
    const config: vscode.DebugConfiguration = {
        // return {
        name: sessionId,
        type: 'node',
        protocol: 'inspector',
        request: 'attach',
        address: 'localhost',
        port: portNumber
    };

    // Try to map workspace folder source files to the remote instance
    if (vscode.workspace.workspaceFolders) {
        if (vscode.workspace.workspaceFolders.length === 1) {
            config.localRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            config.remoteRoot = '/home/site/wwwroot';
        } else {
            // In this case we don't know which folder to use. Show a warning and proceed.
            // In the future we should allow users to choose a workspace folder to map sources from.
            // tslint:disable-next-line:no-floating-promises
            ext.ui.showWarningMessage('Unable to bind breakpoints from workspace when multiple folders are open. Use "loaded scripts" instead.');
        }
    } else {
        // vscode will throw an error if you try to start debugging without any workspace folder open
        throw new Error("Please open a workspace folder before attaching a debugger.");
    }

    return config;
}
