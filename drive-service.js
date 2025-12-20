import { driveConfig } from './firebase-config.js';

let tokenClient;
let gapiInited = false;
let gisInited = false;

export async function initDriveAPI() {
    return new Promise((resolve) => {
        gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: driveConfig.apiKey,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });
            gapiInited = true;
            checkAuth();
            resolve();
        });
    });
}

export async function initGIS() {
    return new Promise((resolve) => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: driveConfig.clientId,
            scope: driveConfig.scopes,
            callback: '', // defined later
        });
        gisInited = true;
        resolve();
    });
}

function checkAuth() {
    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when making API calls.
    }
}

export async function authenticateDrive() {
    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                reject(resp);
            }
            resolve(resp);
        };
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
}

export async function createDriveFolder(folderName) {
    const fileMetadata = {
        'name': folderName,
        'mimeType': 'application/vnd.google-apps.folder'
    };
    try {
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        return response.result.id;
    } catch (err) {
        console.error("Error creating folder", err);
        throw err;
    }
}

export async function uploadFileToDrive(blob, fileName, folderId) {
    const accessToken = gapi.client.getToken().access_token;
    const metadata = {
        name: fileName,
        parents: [folderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
    });
    return await res.json();
}
