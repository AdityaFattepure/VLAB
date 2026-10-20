/**
 * The seven experiments from the CBAD handout (23CSE3118), plus a short demo
 * tour, written as checkable lab tasks. The checker inspects real container
 * state, so the descriptions teach the workflow while the checks stay honest.
 */

export interface SeedTask {
  order: number;
  title: string;
  description: string;
  checkCommand: string;
  expectedOutputContains: string | null;
  expectedExitCode: number;
}

export interface SeedLab {
  id: string;
  code: string;
  title: string;
  description: string;
  objective: string;
  co: string;
  estimatedMinutes: number;
  template: 'docker-dind' | 'linux-basic';
  tasks: SeedTask[];
}

const DOCKER = 'docker-dind' as const;

export const MANUAL_LABS: SeedLab[] = [
  {
    id: 'seed-lab-01',
    code: 'Lab 1',
    title: 'Docker installation and verification',
    description:
      'Verify the Docker client and daemon inside your sandbox, then run your first container.',
    objective:
      'Confirm that the Docker client and daemon are installed and can run a container.',
    co: 'CO1',
    estimatedMinutes: 45,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Save the Docker client version',
        description:
          'Write the client version to a file.\n\nRun:\ndocker --version > /root/docker-version.txt',
        checkCommand:
          "test -s /root/docker-version.txt && grep -qi 'docker version' /root/docker-version.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Save the Docker server version',
        description:
          "Ask the daemon for its version and save it.\n\nRun:\ndocker info --format '{{.ServerVersion}}' > /root/docker-server.txt",
        checkCommand:
          "test -s /root/docker-server.txt && grep -Eq '^[0-9]+\\.[0-9]+' /root/docker-server.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Run a container named hello-web',
        description:
          'Start nginx in the background and publish port 8080.\n\nExample: docker run -d --name hello-web -p 8080:80 nginx:alpine',
        checkCommand:
          "docker ps --filter name=^/hello-web$ --filter status=running --format '{{.Names}}' | grep -qx hello-web",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Verify the web server responds',
        description:
          'Request the page served by the container.\n\nExample: curl -fsS http://localhost:8080',
        checkCommand: "curl -fsS http://localhost:8080 | grep -qi 'welcome to nginx'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-02',
    code: 'Lab 2',
    title: 'Build a Hello World web image',
    description:
      'Create a tiny web page, package it with a Dockerfile, build an image, and run it.',
    objective:
      'Write a Dockerfile, build a custom image, and serve a Hello World page from a container.',
    co: 'CO1',
    estimatedMinutes: 60,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Create the app directory and Dockerfile',
        description:
          'Create /root/hello-world/Dockerfile that starts from nginx:alpine. Use the Code tab to create the file, or use the terminal example below.\n\nExample:\nmkdir -p /root/hello-world\ncat > /root/hello-world/Dockerfile <<\'EOF\'\nFROM nginx:alpine\nCOPY index.html /usr/share/nginx/html/index.html\nEOF',
        checkCommand: 'test -f /root/hello-world/Dockerfile',
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Create the Hello World page',
        description:
          'Create /root/hello-world/index.html containing a visible Hello World heading. The Code tab is the quickest way to write the page; the terminal example is below.\n\nExample:\ncat > /root/hello-world/index.html <<\'EOF\'\n<h1>Hello World!</h1>\nEOF',
        checkCommand:
          "test -f /root/hello-world/index.html && grep -qi 'hello world' /root/hello-world/index.html",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Build the image as hello-world:v1',
        description:
          'Build the image and tag it hello-world:v1.\n\nExample: docker build -t hello-world:v1 /root/hello-world',
        checkCommand: "docker images --format '{{.Repository}}:{{.Tag}}' | grep -qx 'hello-world:v1'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Run the image as hello-web',
        description:
          'Start your image on port 8080 with the container name hello-web.\n\nExample: docker run -d --name hello-web -p 8080:80 hello-world:v1',
        checkCommand:
          "docker ps --filter name=^/hello-web$ --filter status=running --format '{{.Names}}' | grep -qx hello-web",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 5,
        title: 'Verify the custom page is served',
        description:
          'Check that the running container returns your Hello World page.\n\nExample: curl -fsS http://localhost:8080',
        checkCommand: "curl -fsS http://localhost:8080 | grep -qi 'hello world'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-03',
    code: 'Lab 3',
    title: 'Running and managing containers',
    description:
      'Run a container, inspect it, read its logs, and replace it with a new one.',
    objective:
      'Use the Docker CLI to inspect and manage the lifecycle of a running container.',
    co: 'CO1',
    estimatedMinutes: 45,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Run a container named web on port 8081',
        description:
          'Start nginx in the background.\n\nExample: docker run -d --name web -p 8081:80 nginx:alpine',
        checkCommand:
          "docker ps --filter name=^/web$ --filter status=running --format '{{.Names}}' | grep -qx web",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Inspect the container and save the output',
        description:
          'Write the full inspect JSON to /root/web-inspect.json and confirm it is not empty.\n\nExample: docker inspect web > /root/web-inspect.json',
        checkCommand:
          "test -s /root/web-inspect.json && grep -q '\"Id\"' /root/web-inspect.json",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Create traffic and save the container logs',
        description:
          'Request the page, then save the logs to /root/web.log. The log should show a GET request.\n\nExample:\ncurl -fsS http://localhost:8081 > /dev/null\ndocker logs web > /root/web.log 2>&1',
        checkCommand: "test -s /root/web.log && grep -q 'GET /' /root/web.log",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Replace web with a container named web-final',
        description:
          'Remove the old container and start a new one on the same port.\n\nExample:\ndocker rm -f web\ndocker run -d --name web-final -p 8081:80 nginx:alpine',
        checkCommand:
          "docker ps --filter name=^/web-final$ --filter status=running --format '{{.Names}}' | grep -qx web-final && ! docker ps -a --filter name=^/web$ --format '{{.Names}}' | grep -qx web",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-04',
    code: 'Lab 4',
    title: 'A microservice that sums two numbers',
    description:
      'Write a small service and Dockerfile, build your own image, and return the sum of two environment variables.',
    objective:
      'Use the Code tab to create source files, package a shell-based HTTP service in a Docker image, pass configuration through environment variables, and call it over HTTP.',
    co: 'CO2',
    estimatedMinutes: 60,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Create app.sh and Dockerfile',
        description:
          'Use the Code tab to create both files in /root/sum-service. You can also use the terminal and nano.\n\napp.sh reads A and B, writes their sum to the nginx document root, then starts nginx:\n#!/bin/sh\nset -eu\nsum=$((A+B))\nprintf \'%s\\n\' "$sum" > /usr/share/nginx/html/index.html\nexec nginx -g \'daemon off;\'\n\nDockerfile packages the script on the cached nginx image:\nFROM nginx:alpine\nCOPY app.sh /usr/local/bin/app.sh\nRUN chmod +x /usr/local/bin/app.sh\nCMD ["/usr/local/bin/app.sh"]',
        checkCommand:
          "test -f /root/sum-service/app.sh && test -f /root/sum-service/Dockerfile && grep -q 'A+B' /root/sum-service/app.sh && grep -q '^FROM nginx:alpine' /root/sum-service/Dockerfile && grep -q 'COPY app.sh' /root/sum-service/Dockerfile",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Build the sum-service:v1 image',
        description:
          'Build the image from the Dockerfile and tag it sum-service:v1.\n\nExample: docker build -t sum-service:v1 /root/sum-service',
        checkCommand: "docker images --format '{{.Repository}}:{{.Tag}}' | grep -qx 'sum-service:v1'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Run on port 5000 and save the response',
        description:
          'Start your image with A=12 and B=30, then save the response to /root/sum-result.txt.\n\nExample:\ndocker run -d --name sum-service -p 5000:80 -e A=12 -e B=30 sum-service:v1\ncurl -fsS http://localhost:5000 | tee /root/sum-result.txt',
        checkCommand:
          "docker ps --filter name=^/sum-service$ --filter status=running --format '{{.Names}}' | grep -qx sum-service && docker inspect --format '{{.Config.Image}}' sum-service | grep -qx 'sum-service:v1' && curl -fsS http://localhost:5000 | grep -qx 42 && test -s /root/sum-result.txt && grep -qx 42 /root/sum-result.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Save the logs and inspect the service',
        description:
          'Generate a request, save the container logs, and write the status and image to /root/sum-inspect.txt.\n\nExample:\ncurl -fsS http://localhost:5000 > /dev/null\ndocker logs sum-service > /root/sum-service.log 2>&1\ndocker inspect --format "{{.State.Status}} {{.Config.Image}}" sum-service > /root/sum-inspect.txt',
        checkCommand:
          "test -s /root/sum-service.log && grep -q 'GET /' /root/sum-service.log && test -s /root/sum-inspect.txt && grep -qx 'running sum-service:v1' /root/sum-inspect.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-05',
    code: 'Lab 5',
    title: 'Client-server containers on a network',
    description:
      'Put a service and a client on the same user-defined Docker network and call the service by name.',
    objective:
      'Use a user-defined bridge network so one container can reach another by its DNS name.',
    co: 'CO3',
    estimatedMinutes: 60,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Create a network named sum-net',
        description:
          'Create a user-defined bridge network.\n\nExample: docker network create sum-net',
        checkCommand: "docker network ls --format '{{.Name}}' | grep -qx sum-net",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Start sum-service on sum-net',
        description:
          'Run the sum service without publishing a host port. It should listen on the network only.\n\nExample:\ndocker run -d --name sum-service --network sum-net -e A=12 -e B=30 --entrypoint sh nginx:alpine -c \'echo $((A+B)) > /usr/share/nginx/html/index.html && exec nginx -g "daemon off;"\'',
        checkCommand:
          "docker ps --filter name=^/sum-service$ --filter status=running --format '{{.Names}}' | grep -qx sum-service && docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' sum-service | grep -qw sum-net",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Call the service from a client container',
        description:
          'Start sum-client on the same network and write the response to /root/result.txt inside the client.\n\nExample:\ndocker run -d --name sum-client --network sum-net --entrypoint sh nginx:alpine -c \'wget -qO- http://sum-service > /root/result.txt; sleep 3600\'',
        checkCommand:
          'sleep 1; docker exec sum-client cat /root/result.txt 2>/dev/null | grep -qx 42',
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Prove both containers share the network',
        description:
          'Ask Docker which containers are attached to sum-net. Both names should appear.\n\nExample: docker network inspect sum-net --format "{{range .Containers}}{{.Name}} {{end}}"',
        checkCommand:
          "docker network inspect sum-net -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qw sum-service && docker network inspect sum-net -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qw sum-client",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-06',
    code: 'Lab 6',
    title: 'Scale the service up and down',
    description:
      'Run three replicas of the service, verify each one, then scale back to a single replica. This lab uses the Docker CLI; in a Compose project the same idea is `docker compose up -d --scale sum=3`.',
    objective:
      'Observe how running multiple container replicas changes capacity and how to scale down safely.',
    co: 'CO4',
    estimatedMinutes: 60,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Create a network named scale-net',
        description: 'Create the network the replicas will share.\n\nExample: docker network create scale-net',
        checkCommand: "docker network ls --format '{{.Name}}' | grep -qx scale-net",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Run three replicas: sum-1, sum-2, sum-3',
        description:
          'Start three containers on scale-net, each returning 42.\n\nExample:\nfor n in 1 2 3; do docker run -d --name sum-$n --network scale-net --entrypoint sh nginx:alpine -c \'echo 42 > /usr/share/nginx/html/index.html && exec nginx -g "daemon off;"\'; done',
        checkCommand:
          "test \"$(docker ps --filter status=running --format '{{.Names}}' | grep -cE '^sum-[123]$')\" -eq 3",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Verify every replica responds',
        description:
          'Call each replica from inside itself and confirm the response is 42.\n\nExample:\nfor n in 1 2 3; do docker exec sum-$n wget -qO- http://127.0.0.1/; done',
        checkCommand:
          "for n in 1 2 3; do docker exec sum-$n wget -qO- http://127.0.0.1/ 2>/dev/null | grep -qx 42 || exit 1; done",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Scale down to one replica',
        description:
          'Remove sum-2 and sum-3, leaving exactly one running replica.\n\nExample: docker rm -f sum-2 sum-3',
        checkCommand:
          "test \"$(docker ps --filter status=running --format '{{.Names}}' | grep -cE '^sum-[123]$')\" -eq 1",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 5,
        title: 'Record resource usage',
        description:
          'Capture a one-shot stats sample for the remaining replica.\n\nExample: docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" sum-1 > /root/scale-stats.txt',
        checkCommand:
          "test -s /root/scale-stats.txt && grep -q 'sum-1' /root/scale-stats.txt && grep -q '%' /root/scale-stats.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-07',
    code: 'Lab 7',
    title: 'Monitor container performance',
    description:
      'Collect live CPU, memory, process, and health information from a running container.',
    objective:
      'Use Docker monitoring commands to describe the health and resource use of a container.',
    co: 'CO5',
    estimatedMinutes: 45,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Start a container named monitor-web',
        description:
          'Run nginx on port 8083.\n\nExample: docker run -d --name monitor-web -p 8083:80 nginx:alpine',
        checkCommand:
          "docker ps --filter name=^/monitor-web$ --filter status=running --format '{{.Names}}' | grep -qx monitor-web",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Record a CPU and memory sample',
        description:
          'Write one stats sample to /root/monitor-stats.txt.\n\nExample: docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" monitor-web > /root/monitor-stats.txt',
        checkCommand:
          "test -s /root/monitor-stats.txt && grep -q 'monitor-web' /root/monitor-stats.txt && grep -q '%' /root/monitor-stats.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Record the processes inside the container',
        description:
          'Save the container process list to /root/monitor-processes.txt.\n\nExample: docker top monitor-web > /root/monitor-processes.txt',
        checkCommand:
          "test -s /root/monitor-processes.txt && grep -qi nginx /root/monitor-processes.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Save a health report',
        description:
          'Write the container status, start time, and restart policy to /root/monitor-report.txt.\n\nExample: docker inspect --format "{{.State.Status}} {{.State.StartedAt}} {{.HostConfig.RestartPolicy.Name}}" monitor-web > /root/monitor-report.txt',
        checkCommand:
          "test -s /root/monitor-report.txt && grep -q 'running' /root/monitor-report.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 5,
        title: 'Write a short monitoring note',
        description:
          'Create /root/monitor-notes.txt with at least three lines explaining which CPU, memory, and process signals you would watch, and why. You can write this note in the Code tab.',
        checkCommand:
          "test -f /root/monitor-notes.txt && [ \"$(wc -l < /root/monitor-notes.txt)\" -ge 3 ] && grep -qi cpu /root/monitor-notes.txt && grep -qi memory /root/monitor-notes.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
];

/**
 * A deliberately small lab for a live demonstration. Every task leaves a file
 * or container behind, so the checker never has to guess whether a command was
 * typed. The wording is short enough to read from the projector.
 */
export const DEMO_LABS: SeedLab[] = [
  {
    id: 'seed-lab-demo',
    code: 'Basic',
    title: 'Basic Linux and Docker tour',
    description:
      'A five-minute tour: navigate the shell, create a file, check Docker, and run a web container.',
    objective:
      'Use basic commands and the browser workspace, then show the teacher the files and containers you created.',
    co: 'CO1',
    estimatedMinutes: 10,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Create your demo folder',
        description:
          'Create /root/demo and save your current directory.\n\nRun:\nmkdir -p /root/demo\npwd > /root/demo/pwd.txt',
        checkCommand:
          'test -s /root/demo/pwd.txt && grep -qx /root /root/demo/pwd.txt',
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Write a short text file',
        description:
          'Create /root/demo/about.txt with one line of text.\n\nRun:\necho "I am learning Docker" > /root/demo/about.txt\n\nYou can also use the Code tab.',
        checkCommand:
          "test -f /root/demo/about.txt && grep -q 'I am learning Docker' /root/demo/about.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Save the Docker version',
        description:
          'Save the client version to a file.\n\nRun:\ndocker --version > /root/demo/version.txt',
        checkCommand:
          "test -s /root/demo/version.txt && grep -qi 'docker version' /root/demo/version.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 4,
        title: 'Run and check a web server',
        description:
          'Start nginx on port 8080 and save its page.\n\nRun:\ndocker run -d --name basic-web -p 8080:80 nginx:alpine\ncurl -fsS http://localhost:8080 > /root/demo/page.html',
        checkCommand:
          "docker ps --filter name=^/basic-web$ --filter status=running --format '{{.Names}}' | grep -qx basic-web && test -s /root/demo/page.html && grep -qi 'welcome to nginx' /root/demo/page.html",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
];

export const PRACTICE_LABS: SeedLab[] = [
  {
    id: 'seed-lab-docker-basics',
    code: 'Practice',
    title: 'Docker Basics',
    description:
      'A short warm-up: run a container, build an image, and create a volume.',
    objective: 'Practise the three Docker objects you will use in every later lab.',
    co: 'CO1',
    estimatedMinutes: 30,
    template: DOCKER,
    tasks: [
      {
        order: 1,
        title: 'Run a container named web',
        description:
          'Start a container named web from the nginx image.\n\nExample: docker run -d --name web nginx:alpine',
        checkCommand: "docker ps --filter name=^/web$ --format '{{.Names}}'",
        expectedOutputContains: 'web',
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Build an image tagged myapp:v1',
        description:
          'Build the sample app at /root/app and tag it myapp:v1.\n\nExample: docker build -t myapp:v1 /root/app',
        checkCommand: "docker images --format '{{.Repository}}:{{.Tag}}' | grep -qx 'myapp:v1'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 3,
        title: 'Create a volume named data',
        description:
          'Create a Docker volume named data.\n\nExample: docker volume create data',
        checkCommand: "docker volume ls -q | grep -qx 'data'",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
  {
    id: 'seed-lab-linux-basics',
    code: 'Practice',
    title: 'Linux Basics',
    description: 'A plain Ubuntu container. Practise files and users; the checker verifies the filesystem.',
    objective: 'Create a file and a user in a Linux container.',
    co: 'CO1',
    estimatedMinutes: 20,
    template: 'linux-basic',
    tasks: [
      {
        order: 1,
        title: 'Create a file containing vlab',
        description:
          'Create /root/lab/hello.txt with the word vlab in it.\n\nExample: echo vlab > /root/lab/hello.txt',
        checkCommand: "test -f /root/lab/hello.txt && grep -q vlab /root/lab/hello.txt",
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
      {
        order: 2,
        title: 'Create a user named analyst',
        description: 'Add a Linux user called analyst.\n\nExample: useradd -m analyst',
        checkCommand: 'id analyst >/dev/null 2>&1',
        expectedOutputContains: null,
        expectedExitCode: 0,
      },
    ],
  },
];
