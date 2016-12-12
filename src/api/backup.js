export function list ({ remote }) {
  return this.listVmBackups(remote)
}

list.permission = 'admin'
list.params = {
  remote: { type: 'string' }
}

// -------------------------------------------------------------------

export function scanDisk ({ remote, disk }) {
  return {
    partitions: [
      {
        id: '90def144-9e70-4565-b62f-a048b8e3dad5',
        name: 'root',
        type: 'linux',
        size: 5905580032
      }
    ]
  }
}

scanDisk.permission = 'admin'
scanDisk.params = {
  remote: { type: 'string' },
  disk: { type: 'string' }
}

// -------------------------------------------------------------------

export function scanFiles ({ remote, disk, partition, path }) {
  return {
    'bin/': {},
    'boot/': {},
    'dev/': {},
    'etc/': {},
    'home/': {},
    'initrd.img': {},
    'initrd.img.old': {},
    'lib/': {},
    'lib32/': {},
    'lib64/': {},
    'libx32/': {},
    'lost+found/': {},
    'media/': {},
    'mnt/': {},
    'opt/': {},
    'proc/': {},
    'root/': {},
    'run/': {},
    'sbin/': {},
    'srv/': {},
    'sys/': {},
    'tmp/': {},
    'usr/': {},
    'var/': {},
    'vmlinuz': {},
    'vmlinuz.old': {}
  }
}

scanFiles.permission = 'admin'
scanFiles.params = {
  remote: { type: 'string' },
  disk: { type: 'string' },
  partition: { type: 'string' },
  path: { type: 'string' }
}

// -------------------------------------------------------------------

export function fetchFiles ({ remote, disk, partition, paths }) {
  return this.registerHttpRequest().then(url => ({ $getFrom: url }))
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
