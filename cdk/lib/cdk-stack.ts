import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
// import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // S3バケットの作成
    // AWS CDKのs3.Bucketクラスを使用してS3バケットを作成します。
    // bucketNameプロパティにはバケット名を指定します。ここでは "test-bucket" に乱数を加えたものをバケット名としています。
    // publicReadAccessプロパティにはバケットの公開設定を指定します。ここではfalseを指定してバケットを非公開にしています。
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `test-bucket-${Math.floor(Math.random() * 1000)}`,
      publicReadAccess: false,
    });

    // DynamoDBテーブルの作成
    // AWS CDKのdynamodb.Tableクラスを使用してDynamoDBテーブルを作成します。
    // tableNameプロパティにはテーブル名を指定します。ここでは "TestApp" をテーブル名としています。
    // partitionKeyプロパティにはパーティションキーの名前と型を指定します。ここでは "TestId" を名前とし、型は文字列としています。
    const table = new dynamodb.Table(this, "Table", {
      tableName: "TestApp",
      partitionKey: { name: "TestId", type: dynamodb.AttributeType.STRING },
    });

    // Lambda関数の作成
    // AWS CDKのlambda.Functionクラスを使用してLambda関数を作成します。
    // codeプロパティにはLambda関数のソースコードを指定します。ここでは "lambda/app" フォルダ内の "index.mjs" をソースコードとしています。
    // handlerプロパティにはLambda関数のハンドラーを指定します。ここでは "index.mjs" をハンドラーとしています。
    // runtimeプロパティにはLambda関数のランタイムを指定します。ここではNode.jsバージョン14をランタイムとしています。
    // environmentプロパティにはLambda関数の環境変数を指定します。ここではテーブル名を環境変数として設定しています。
    const lambdaFunction = new lambda.Function(this, "Lambda", {
      code: lambda.Code.fromAsset(path.join(__dirname, "/lambda/app")),
      handler: "index.mjs",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // LambdaにDynamoDBへのフルアクセス権限を付与
    // grantFullAccessメソッドを使用してLambda関数にDynamoDBテーブルへのフルアクセス権限を付与します。
    table.grantFullAccess(lambdaFunction);

    // API Gatewayの作成
    // AWS CDKのapigw.RestApiクラスを使用してAPI Gatewayを作成します。
    // restApiNameプロパティにはAPIの名前を指定します。ここでは "ApiGatewayWithLambda" をAPIの名前としています。
    // defaultCorsPreflightOptionsプロパティにはCORSの設定を指定します。ここでは全てのオリジンからのアクセスと全てのHTTPメソッドを許可しています。
    const api = new apigw.RestApi(this, "Api", {
      restApiName: "ApiGatewayWithLambda",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // LambdaとAPI Gatewayの統合
    // AWS CDKのapigw.LambdaIntegrationクラスを使用してLambda関数とAPI Gatewayを統合します。
    // requestTemplatesプロパティにはリクエストテンプレートを指定します。ここではJSON形式のリクエストテンプレートを指定しています。
    const lambdaIntegration = new apigw.LambdaIntegration(lambdaFunction, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    // API GatewayのルートにPOSTメソッドを追加
    // addMethodメソッドを使用してAPI GatewayのルートにPOSTメソッドを追加します。ここではLambda関数と統合したPOSTメソッドを追加しています。
    api.root.addMethod("POST", lambdaIntegration);

    // S3バケットへのCloudFrontの設定
    // AWS CDKのcloudfront.Distributionクラスを使用してCloudFrontの設定を行います。
    // defaultBehaviorプロパティにはデフォルトのビヘイビアを指定します。ここではS3バケットをOriginとして設定しています。
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: { origin: new origins.S3Origin(bucket) },
    });

    // API Gatewayへのビヘイビアの追加
    // addBehaviorメソッドを使用してAPI Gatewayへのビヘイビアを追加します。ここでは "/api" パスにAPI Gatewayを設定しています。
    distribution.addBehavior("/api", new origins.HttpOrigin(api.url));

    // Cognitoユーザープールの作成
    // AWS CDKのcognito.UserPoolクラスを使用してCognitoユーザープールを作成します。
    // selfSignUpEnabledプロパティにはユーザー自己登録の許可を指定します。ここではtrueを設定しています。
    // autoVerifyプロパティには自動確認の設定を指定します。ここではEメールアドレスを自動確認するように設定しています。
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      autoVerify: { email: true },
    });

    // Cognitoユーザープールクライアントの作成
    // AWS CDKのcognito.UserPoolClientクラスを使用してCognitoユーザープールクライアントを作成します。
    // userPoolプロパティにはユーザープールを指定します。ここでは先ほど作成したユーザープールを指定しています。
    // callbackUrlsプロパティには認証後の遷移先を指定します。ここでは "http://localhost:3000" と CloudFrontのDistributionドメイン名を指定しています。
    // logoutUrlsプロパティにはログアウト時の遷移先を指定します。ここでは "http://localhost:3000" と CloudFrontのDistributionドメイン名を指定しています。
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      oAuth: {
        callbackUrls: [
          `http://localhost:3000`,
          distribution.distributionDomainName,
        ],
        logoutUrls: [
          `http://localhost:3000`,
          distribution.distributionDomainName,
        ],
      },
    });

    // CloudFormationの出力
    // AWS CDKのcdk.CfnOutputクラスを使用してCloudFormationの出力を設定します。
    // 各リソースの情報を出力します。
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolWebClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: api.url });
  }
}
