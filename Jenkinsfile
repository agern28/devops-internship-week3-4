// Day 15 — Optional: equivalent pipeline expressed as a Jenkinsfile
pipeline {
  agent any

  environment {
    IMAGE = "ghcr.io/agern28/devops-internship-week3-4"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Install') {
      steps { sh 'npm ci' }
    }

    stage('Lint') {
      steps { sh 'npm run lint' }
    }

    stage('Test') {
      steps { sh 'npm test' }
      post {
        always {
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    stage('Build image') {
      steps {
        sh "docker build -t ${IMAGE}:${env.BUILD_NUMBER} ."
      }
    }

    stage('Push image') {
      when { buildingTag() }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'ghcr-credentials',
          usernameVariable: 'REG_USER',
          passwordVariable: 'REG_PASS')]) {
          sh '''
            echo "$REG_PASS" | docker login ghcr.io -u "$REG_USER" --password-stdin
            docker tag ${IMAGE}:${BUILD_NUMBER} ${IMAGE}:${TAG_NAME}
            docker push ${IMAGE}:${TAG_NAME}
          '''
        }
      }
    }

    stage('Deploy') {
      when { buildingTag() }
      steps {
        sh 'helm upgrade --install myapp ./helm/myapp -n app --set image.tag=${TAG_NAME}'
      }
    }
  }

  post {
    success { echo 'Pipeline succeeded.' }
    failure { echo 'Pipeline failed.' }
  }
}
