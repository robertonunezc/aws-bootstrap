const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
const size = "t2.micro"; // for example
const ami = "ami-07caf09b362be10b8"; // update to your preferred AMI

// Create a security group for the EC2 instance to allow HTTP traffic
const sg = new aws.ec2.SecurityGroup("web-sg", {
    ingress: [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
        { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] } // For SSH Access
    ],
    egress: [
        { protocol: "tcp", fromPort: 0, toPort: 65535, cidrBlocks: ["0.0.0.0/0"] }
    ],
});

// Create a S3 bucket to use for codepipeline
const bucket = new aws.s3.Bucket("CodePipelineS3Bucket",{
    bucket: "codepipeline-bucket-aws-bootstrap",
    acl: "private",
    serverSideEncryptionConfiguration: {
        rule: {
            applyServerSideEncryptionByDefault: {
                sseAlgorithm: "AES256",
            },
        },
    },
    publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
    },
}, {
    // Prevent the bucket from being deleted on stack destroy
    deleteBeforeReplace: true,
});

// Create an EC2 instance and install a simple web server
const server = new aws.ec2.Instance("web-server", {
    // Refer to your AMI ID
    ami: ami,
    instanceType: size,
    securityGroups: [sg.name], // reference the security group we created above
    // Setup an SSH keypair for a secure connection, replace with your own
    keyName: "awsedicative",
    userData: pulumi.interpolate` #!/bin/bash -xe

    exec > /tmp/userdata.log 2>&1 

    yum -y update

    cat > /tmp/install_script.sh << EOF 
        echo "Setting up NodeJS Environment"
        curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
        . /home/ec2-user/.nvm/nvm.sh
        . /home/ec2-user/.bashrc
        nvm alias default v22
        nvm install v22
        nvm use v22
        wget https://github.com/robertonunezc/aws-bootstrap/archive/master.zip 
        unzip master.zip
        mv aws-bootstrap-master app
        mkdir -p /home/ec2-user/app/logs
        cd app
        npm install
        npm start
    EOF &
` // Starts a simple HTTP server on port 80
});

// Create a second EC2 instance
const server2 = new aws.ec2.Instance("web-server2", {
    ami: ami,
    instanceType: size,
    securityGroups: [sg.name],
    keyName: "awsedicative",
    userData:pulumi.interpolate ` #!/bin/bash -xe

    exec > /tmp/userdata.log 2>&1 

    yum -y update

    cat > /tmp/install_script.sh << EOF 
        echo "Setting up NodeJS Environment"
        curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
        . /home/ec2-user/.nvm/nvm.sh
        . /home/ec2-user/.bashrc
        nvm alias default v22
        nvm install v22
        nvm use v22
        wget https://github.com/robertonunezc/aws-bootstrap/archive/master.zip 
        unzip master.zip
        mv aws-bootstrap-master app
        mkdir -p /home/ec2-user/app/logs
        cd app
        npm install
        npm start
    EOF &
   `
}); 

exports.publicIp = server.publicIp;
exports.publicHostName = server.publicDns;