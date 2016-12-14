import { basename } from 'path'

// ===================================================================

export function list ({ remote }) {
  return this.listVmBackups(remote)
}

list.permission = 'admin'
list.params = {
  remote: { type: 'string' }
}

// -------------------------------------------------------------------

export function scanDisk ({ remote, disk }) {
  return this.scanDiskBackup(remote, disk)
}

scanDisk.permission = 'admin'
scanDisk.params = {
  remote: { type: 'string' },
  disk: { type: 'string' }
}

// -------------------------------------------------------------------

export function scanFiles ({ remote, disk, partition, path }) {
  return this.scanFilesInDiskBackup(remote, disk, partition, path)
}

scanFiles.permission = 'admin'
scanFiles.params = {
  remote: { type: 'string' },
  disk: { type: 'string' },
  partition: { type: 'string' },
  path: { type: 'string' }
}

// -------------------------------------------------------------------

const handleFetchFiles = (req, res, { remote, disk, partition, paths }) =>
  this.fetchFilesInDiskBackup(remote, disk, partition, paths).then(files => {
    files[0].pipe(res)
  })

export async function fetchFiles (params) {
  return this.registerHttpRequest(handleFetchFiles, params, {
    suffix: `/${basename(params.paths[0])}`
  }).then(url => ({ $getFrom: url }))
}

fetchFiles.permission = 'admin'
fetchFiles.params = {
  remote: { type: 'string' },
  disk: { type: 'string' },
  partition: { type: 'string' },
  paths: {
    type: 'array',
    items: { type: 'string' },
    minLength: 1,
    maxLength: 1 // TODO: remove when able to tar
  }
}
