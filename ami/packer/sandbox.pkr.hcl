packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "version" {
  type    = string
  default = "0.1.0"
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

source "amazon-ebs" "sandbox" {
  ami_name      = "launchpad-sandbox-${formatdate("YYYYMMDD-hhmmss", timestamp())}"
  instance_type = var.instance_type
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }

  ssh_username              = "ubuntu"
  ssh_clear_authorized_keys = true
  shutdown_behavior         = "terminate"

  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 50
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  tags = {
    Name        = "launchpad-sandbox"
    Project     = "Launchpad"
    Version     = var.version
    BaseOS      = "Ubuntu 24.04"
    BuildDate   = timestamp()
  }

  run_tags = {
    Name = "packer-launchpad-sandbox-builder"
  }
}

build {
  sources = ["source.amazon-ebs.sandbox"]

  # 1. System 기본 패키지
  provisioner "shell" {
    script = "../scripts/install-base.sh"
  }

  # 2. OpenCode + oh-my-openagent
  provisioner "shell" {
    script = "../scripts/install-opencode.sh"
  }

  # 3. Caddy 리버스 프록시
  provisioner "shell" {
    script = "../scripts/install-caddy.sh"
  }

  # 4. Deploy skill 복사
  provisioner "file" {
    source      = "../../skills/deploy/"
    destination = "/tmp/deploy-skill/"
  }

  provisioner "shell" {
    inline = [
      "sudo mkdir -p /opt/launchpad/skills/deploy",
      "sudo cp -r /tmp/deploy-skill/* /opt/launchpad/skills/deploy/",
      "sudo chown -R ubuntu:ubuntu /opt/launchpad",
    ]
  }

  # 5. Systemd 서비스 설정
  provisioner "shell" {
    script = "../scripts/setup-services.sh"
  }

  # 6. 정리
  provisioner "shell" {
    inline = [
      "sudo apt-get clean",
      "sudo rm -rf /tmp/* /var/tmp/*",
      "sudo rm -rf /var/lib/apt/lists/*",
      "history -c",
    ]
  }

  # AMI ID를 SSM Parameter Store에 저장
  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
  }
}
