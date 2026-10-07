# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-10-07
### Added
- capabilities.json manifest (validated against StaticCapabilitiesSchema from @tak-ps/etl) declaring the feature:submit permission, a 360 second compute timeout and a default schedule of rate(6 minutes)
- CI embeds capabilities.json as the com.cloudtak.capabilities OCI annotation using docker buildx; the CloudFormation-export ECR lookup is unchanged
- GitHub Actions workflows etl-deploy.yml and lint.yml
- Basic node:test suite (run with tsx) wired into npm test
- Declare @eslint/js as a devDependency
### Changed
- Update @tak-ps/etl from 9.22.0 to 10.x
- Use Task.init() in the local and Lambda handler entry points
- Require Node 24 in CI, package.json engines and the Dockerfile base image
- Update dependencies including TypeScript 6 and ESLint 10, and move tsconfig.json to bundler module resolution
- Resolve npm audit advisories (49 to 0)
- Lint now covers the test directory

## [1.0.0] - 2024-01-XX

### Added
- Initial implementation of APRS ETL for TAK
- Basic APRS frame parsing
- Integration with APRS-IS servers
- Configurable filters and parameters
- Support for position reports and comments
- TAK-compatible CoT output format
- Add a .dockerignore so .git, .github, node_modules, dist, test, docs, .agents, .env*, and markdown files are kept out of the image build context
