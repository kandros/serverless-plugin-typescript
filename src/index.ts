import * as path from 'path'
import * as fs from 'fs-p'
import * as _ from 'lodash'
import { ServerlessOptions, ServerlessInstance } from './types'
import * as typescript from './typescript'

// Folders
const serverlessFolder = '.serverless'
const buildFolder = '.build'

class ServerlessPlugin {

  private originalServicePath: string

  serverless: ServerlessInstance
  options: ServerlessOptions
  hooks: { [key: string]: Function }

  constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
    this.serverless = serverless
    this.options = options

    this.hooks = {
      'before:deploy:createDeploymentArtifacts': this.beforeCreateDeploymentArtifacts.bind(this),
      'after:deploy:createDeploymentArtifacts': this.afterCreateDeploymentArtifacts.bind(this),
    }
  }

  async beforeCreateDeploymentArtifacts(): Promise<void> {
    this.serverless.cli.log('Compiling with Typescript...')

    // Save original service path and functions
    this.originalServicePath = this.serverless.config.servicePath

    // Fake service path so that serverless will know what to zip
    this.serverless.config.servicePath = path.join(this.originalServicePath, buildFolder)

    const tsFileNames = typescript.extractFileNames(this.serverless.service.functions)
    const tsconfig = typescript.getTypescriptConfig(this.originalServicePath)

    for (const fnName in this.serverless.service.functions) {
      const fn = this.serverless.service.functions[fnName]
      fn.package = fn.package || {
          exclude: [],
          include: [],
        }
      fn.package.exclude = _.uniq([...fn.package.exclude, 'node_modules/serverless-plugin-typescript'])
    }

    tsconfig.outDir = buildFolder

    await typescript.run(tsFileNames, tsconfig)

    // include node_modules into build
    fs.symlinkSync(path.resolve('node_modules'), path.resolve(path.join(buildFolder, 'node_modules')))
  }

  async afterCreateDeploymentArtifacts(): Promise<void> {
    // Restore service path
    this.serverless.config.servicePath = this.originalServicePath

    // Copy .build to .serverless
    await fs.copy(
      path.join(this.originalServicePath, buildFolder, serverlessFolder),
      path.join(this.originalServicePath, serverlessFolder)
    )

    this.serverless.service.package.artifact = path.join(this.originalServicePath, serverlessFolder, path.basename(this.serverless.service.package.artifact))

    // Remove temp build folder
    fs.removeSync(path.join(this.originalServicePath, buildFolder))
  }
}

module.exports = ServerlessPlugin
