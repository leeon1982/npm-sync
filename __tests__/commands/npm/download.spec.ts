import fs from 'fs'
import * as fsUtils from '@app/fs-utils'

const MemoryStream = require('memorystream')

jest.mock('fs')
jest.mock('@app/fs-utils')

import NPMDownloader, { NPMDownloaderOptions, PackageEmitter } from '@app/commands/npm/download'

const DUMMY_PACKAGE_JSON = {
  _id: 'dummy-package@1.0.0',
  name: 'dummy-package',

  dist: {
    tarball: 'http://path/to/dummy-package-1.0.0.tgz',
    shasum: 'abcdef'
  },

  dependencies: {
    'dummy-dependency-1': '^1.0.0'
  }
}

const DUMMY_DEPENDENCY_1_JSON = {
  _id: 'dummy-dependency-1@1.0.1',
  name: 'dummy-dependency-1',

  dist: {
    tarball: 'http://path/to/dummy-dependency-1-1.0.1.tgz',
    shasum: 'abcdef'
  },

  dependencies: {
    'dummy-dependency-2': '^2.1.0'
  }
}

const DUMMY_DEPENDENCY_2_JSON = {
  _id: 'dummy-dependency-2@2.1.0',
  name: 'dummy-dependency-2',

  dist: {
    tarball: 'http://path/to/dummy-dependency-2-2.1.0.tgz',
    shasum: 'abcdef'
  },
}

let mockResolver = {
  resolve: jest.fn().mockImplementation((packageSpec) => {
    if (packageSpec == 'dummy-package@latest') {
      return Promise.resolve(DUMMY_PACKAGE_JSON)
    } else if (packageSpec.toString() == 'dummy-dependency-1@^1.0.0') {
      return Promise.resolve(DUMMY_DEPENDENCY_1_JSON)
    } else if (packageSpec.toString() == 'dummy-dependency-2@^2.1.0') {
      return Promise.resolve(DUMMY_DEPENDENCY_2_JSON)
    }
  })
}

let mockOn = jest.fn()
let mockDownload = jest.fn().mockResolvedValue(null)

let downloaderOptions: NPMDownloaderOptions = {
  resolver: mockResolver as any,

  factory: jest.fn().mockImplementation(
    (url: string | URL, dest: string) => ({
      url: url,
      dest: dest,

      on: mockOn,
      download: mockDownload
    })
  )
}

beforeEach(() => {
  mockResolver.resolve.mockClear()
  mockOn.mockClear()
  mockDownload.mockClear()
  ;(downloaderOptions.factory! as jest.Mock).mockClear()
})

test('dowloading package with dependencies', async () => {
  let downloader = new NPMDownloader(downloaderOptions)

  ;(fsUtils.exists as jest.Mock).mockResolvedValue(false)
  ;(fsUtils.ensureDirectory as jest.Mock).mockResolvedValue(null)
  downloader.checksumMatches = jest.fn().mockResolvedValue(false)

  await downloader.download('dummy-package@latest')

  let expected = [
    ['http://path/to/dummy-package-1.0.0.tgz', 'downloads/dummy-package/dummy-package-1.0.0.tgz'],
    ['http://path/to/dummy-dependency-1-1.0.1.tgz', 'downloads/dummy-dependency-1/dummy-dependency-1-1.0.1.tgz'],
    ['http://path/to/dummy-dependency-2-2.1.0.tgz', 'downloads/dummy-dependency-2/dummy-dependency-2-2.1.0.tgz']
  ]

  for (let [url, dest] of expected) {
    expect(downloaderOptions.factory).toHaveBeenCalledWith(url, dest)
  }
})

test('calculating checksum', async () => {
  let downloader = new NPMDownloader(downloaderOptions)

  ;(fs.createReadStream as jest.Mock).mockReturnValue(
    new MemoryStream('dummy data', { writable: false })
  )

  let result = await downloader.checksumMatches('dummy/path', '611ff54ef4d8389cf982da9516804906d99389b6')

  expect(fs.createReadStream).toHaveBeenCalledWith('dummy/path')
  expect(result).toBeTruthy()
})

test('fetching packages to download', async () => {
  let emitter = new PackageEmitter('dummy-package@latest')
  let downloader = new NPMDownloader(downloaderOptions)
  let pending = await downloader.fetchPackagesToDownload('dummy-package@latest')

  expect(pending).toEqual(new Map([
    ['dummy-package@1.0.0', DUMMY_PACKAGE_JSON],
    ['dummy-dependency-1@1.0.1', DUMMY_DEPENDENCY_1_JSON],
    ['dummy-dependency-2@2.1.0', DUMMY_DEPENDENCY_2_JSON]
  ]))
})
