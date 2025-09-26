Let's think through the rescan capability as its a continous problem.

The goal of splitting registry handlers (/app/harborguard/src/lib/registry/providers) were to make it so that on image scan, they are separated by their origin, their Registry.
ie: If the image is scanned from local, the registry should be Local or Local Docker, if from Docker Hub then it should be Docker Hub Public.

On rescanning the scan from that intended registry should be called to execute said scan. Currently, when I scan a docker hub image (in this case Alpine) I get this:
- Registry: Docker Hub Public (Correct)
- Rescan: Failure. Scan execution failed for 20250923-222225-58ca54fe: [Error: Command failed: skopeo inspect   --format '{{.Digest}}' docker://docker.io/alpine:latest
time="2025-09-23T18:22:35-04:00" level=fatal msg="Error determining repository tags: unable to retrieve auth token: invalid username/password: unauthorized: incorrect username or password"
] {
  code: 1,
  killed: false,
  signal: null,
  cmd: "skopeo inspect   --format '{{.Digest}}' docker://docker.io/alpine:latest",
  stdout: '',
  stderr: 'time="2025-09-23T18:22:35-04:00" level=fatal msg="Error determining repository tags: unable to retrieve auth token: invalid username/password: unauthorized: incorrect username or password"\n'
}


When scanning a local image (postgres:15-alpine) I get:
- Registry: Docker Hub (? Incorrect, should be local or similar)
- Rescan: Failure: [2025-09-23T22:27:30.936Z] INFO  Requesting scan for postgres:latest with requestId: 20250923-222730-203bb748
Failed to inspect Docker image postgres:latest: [Error: Command failed: docker inspect "postgres:latest"
Error: No such object: postgres:latest
] {
  code: 1,
  killed: false,
  signal: null,
  cmd: 'docker inspect "postgres:latest"',
  stdout: '[]\n',
  stderr: 'Error: No such object: postgres:latest\n'
}
Failed to initialize local Docker scan record: Error: Failed to inspect Docker image: Command failed: docker inspect "postgres:latest"
Error: No such object: postgres:latest

    at inspectDockerImage (src/lib/docker.ts:108:10)
    at async DatabaseAdapter.initializeLocalDockerScanRecord (src/lib/scanner/DatabaseAdapter.ts:50:24)
    at async ScannerService.startScan (src/lib/scanner/ScannerService.ts:50:32)
    at async processSingleScan (src/app/api/scans/start/route.ts:174:17)
    at async POST (src/app/api/scans/start/route.ts:275:19)
  106 |   } catch (error) {
  107 |     console.error(`Failed to inspect Docker image ${imageName}:`, error);
> 108 |     throw new Error(`Failed to inspect Docker image: ${error instanceof Error ? error.message : String(error)}`);
      |          ^
  109 |   }
  110 | }